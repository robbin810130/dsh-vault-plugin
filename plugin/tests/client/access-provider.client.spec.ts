import { describe, expect, it, vi } from 'vitest'
import { createVaultAccessProvider } from '../../src/client/access/provider.js'
import { createVaultClientStore, type VaultClientStore } from '../../src/client/store.js'
import type { VaultApiClient } from '../../src/client/api.js'
import type { VaultApiRequest, VaultApiResult, VaultSnapshot, VaultTarget } from '../../src/shared/contracts.js'

const now = '2026-08-25T00:00:00.000Z'
const token = 'A'.repeat(43)

function ok<T>(value: T): VaultApiResult<T> { return { ok: true, value } }

function binding(
  targetType: 'workspace' | 'session',
  targetId: string,
  mode: 'direct' | 'inherit' | 'no-inherit',
  groupId?: string,
  workspaceId?: string,
): VaultSnapshot['bindings'][number] {
  return {
    targetType, targetId, mode,
    ...(groupId === undefined ? {} : { passwordGroupId: groupId }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
    createdAt: now, updatedAt: now,
  }
}

function makeSnapshot(bindings: VaultSnapshot['bindings']): VaultSnapshot {
  return {
    revision: 1,
    policy: {
      autoLockMinutes: 15,
      lockOnSystemSleep: true,
      lockedNameVisibility: 'workspace-visible-session-hidden',
      failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 },
    },
    groups: [
      { id: 'group-a', name: 'Alpha', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: now, memberCount: 1 },
      { id: 'group-b', name: 'Beta', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: now, memberCount: 1 },
    ],
    bindings,
  }
}

function makeStore(snapshot: VaultSnapshot): VaultClientStore {
  const api: VaultApiClient = {
    async call<T>(request: VaultApiRequest): Promise<VaultApiResult<T>> {
      if (request.action === 'snapshot') return ok(snapshot) as VaultApiResult<T>
      if (request.action === 'unlock') {
        return ok({ grant: { groupId: request.groupId, credentialVersion: 1, token }, expiresAt: 10_000 }) as VaultApiResult<T>
      }
      if (request.action === 'grants-validate') return ok({ valid: true }) as VaultApiResult<T>
      throw new Error('unexpected request')
    },
  }
  return createVaultClientStore(api)
}

const target = (type: 'workspace' | 'session', id: string, workspaceId?: string): VaultTarget => ({
  type, id, ...(workspaceId === undefined ? {} : { workspaceId }),
})

describe('Vault navigation access provider', () => {
  it('bypasses plain targets and blocks workspace, inherited, direct override, expired, and offline targets', async () => {
    const store = makeStore(makeSnapshot([
      binding('workspace', 'w-locked', 'direct', 'group-a'),
      binding('session', 's-inherited', 'inherit', undefined, 'w-locked'),
      binding('session', 's-direct', 'direct', 'group-b', 'w-locked'),
    ]))
    await store.refresh()
    const provider = createVaultAccessProvider(store)

    expect(provider.matchesWorkspace('w-plain')).toBe(false)
    expect(provider.workspaceState('w-plain')).toEqual({ kind: 'allow' })
    expect(provider.workspaceState('w-locked').kind).toBe('blocked')
    expect(provider.sessionState('s-inherited').kind).toBe('blocked')
    expect(provider.sessionState('s-direct').kind).toBe('blocked')

    const pending = provider.requestWorkspace('w-locked')
    store.cancelUnlock('group-a')
    await expect(pending).resolves.toEqual({ allow: false, handled: true })

    const offline = makeStore(makeSnapshot([binding('workspace', 'w-locked', 'direct', 'group-a')]))
    await offline.refresh()
    const offlineProvider = createVaultAccessProvider(offline)
    await offline.lockAll()
    expect(offlineProvider.workspaceState('w-locked').kind).toBe('blocked')
  })

  it('shares one prompt per group, rejects another group, and cancellation returns handled deny', async () => {
    const store = makeStore(makeSnapshot([
      binding('workspace', 'w-a', 'direct', 'group-a'),
      binding('workspace', 'w-b', 'direct', 'group-b'),
    ]))
    await store.refresh()
    const provider = createVaultAccessProvider(store)
    const first = provider.requestWorkspace('w-a')
    const second = provider.requestWorkspace('w-a')
    const other = provider.requestWorkspace('w-b')
    expect(store.getSnapshot().prompt).toEqual({ groupId: 'group-a', target: target('workspace', 'w-a') })
    await expect(other).resolves.toEqual({ allow: false })
    store.cancelUnlock('group-a')
    await expect(first).resolves.toEqual({ allow: false, handled: true })
    await expect(second).resolves.toEqual({ allow: false, handled: true })
  })

  it('allows an unlocked direct group and only settles true after the grant is recorded', async () => {
    const store = makeStore(makeSnapshot([binding('workspace', 'w-a', 'direct', 'group-a')]))
    await store.refresh()
    const provider = createVaultAccessProvider(store)
    const pending = provider.requestWorkspace('w-a')
    await store.unlock('group-a', 'password')
    store.settleUnlock('group-a')
    await expect(pending).resolves.toEqual({ allow: true })
    expect(provider.workspaceState('w-a')).toEqual({ kind: 'allow' })
  })
})
