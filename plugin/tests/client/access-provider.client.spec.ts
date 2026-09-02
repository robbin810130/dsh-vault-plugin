import { describe, expect, it, vi } from 'vitest'
import { createVaultAccessProvider } from '../../src/client/access/provider.js'
import { createVaultClientStore, type VaultClientStore } from '../../src/client/store.js'
import type { VaultApiClient } from '../../src/client/api.js'
import type { VaultApiRequest, VaultApiResult, VaultSnapshot, VaultTarget } from '../../src/shared/contracts.js'
import { rememberWorkspaceIdForSession } from '../../src/client/rows/presentation.js'

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
        return ok({ grant: { groupId: request.groupId, credentialVersion: 1, token }, expiresAt: Date.now() + 10_000 }) as VaultApiResult<T>
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
  it('allows an unbound session when Vault has no protection configuration', async () => {
    const snapshot = { ...makeSnapshot([]), groups: [] }
    const store = makeStore(snapshot)
    await store.refresh()
    const provider = createVaultAccessProvider(store)

    expect(provider.sessionState('s-plain').kind).toBe('allow')
  })

  it('blocks a grant immediately when Host expiry is reached', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const api: VaultApiClient = {
      async call<T>(request: VaultApiRequest): Promise<VaultApiResult<T>> {
        if (request.action === 'snapshot') return ok(makeSnapshot([binding('workspace', 'w-locked', 'direct', 'group-a')])) as VaultApiResult<T>
        if (request.action === 'unlock') return ok({ grant: { groupId: 'group-a', credentialVersion: 1, token }, expiresAt: 1_000 }) as VaultApiResult<T>
        throw new Error('unexpected request')
      },
    }
    const store = createVaultClientStore(api)
    await store.refresh()
    await store.unlock('group-a', 'password')
    const provider = createVaultAccessProvider(store)

    expect(provider.workspaceState('w-locked')).toEqual({ kind: 'blocked', reason: 'Vault group locked' })
  })

  it('blocks a grant after the clock advances beyond its expiry', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const api: VaultApiClient = {
      async call<T>(request: VaultApiRequest): Promise<VaultApiResult<T>> {
        if (request.action === 'snapshot') return ok(makeSnapshot([binding('workspace', 'w-locked', 'direct', 'group-a')])) as VaultApiResult<T>
        if (request.action === 'unlock') return ok({ grant: { groupId: 'group-a', credentialVersion: 1, token }, expiresAt: 2_000 }) as VaultApiResult<T>
        throw new Error('unexpected request')
      },
    }
    const store = createVaultClientStore(api)
    await store.refresh()
    await store.unlock('group-a', 'password')
    const provider = createVaultAccessProvider(store)
    expect(provider.workspaceState('w-locked')).toEqual({ kind: 'allow' })

    clock.mockReturnValue(2_000)
    expect(provider.workspaceState('w-locked')).toEqual({ kind: 'blocked', reason: 'Vault group locked' })
  })

  it('uses the current workspace for inherited sessions and fails closed without it', async () => {
    const store = makeStore(makeSnapshot([
      binding('workspace', 'w-old', 'direct', 'group-a'),
      binding('workspace', 'w-new', 'direct', 'group-b'),
      binding('session', 's-moved', 'inherit', undefined, 'w-old'),
    ]))
    await store.refresh()
    await store.unlock('group-a', 'password')
    const provider = createVaultAccessProvider(store)

    expect(provider.sessionState('s-moved').kind).toBe('blocked')
    expect(provider.sessionState('s-moved', 'w-new')).toEqual({ kind: 'blocked', reason: 'Vault group locked' })
  })

  it('inherits current workspace protection when the session has no explicit binding', async () => {
    const store = makeStore(makeSnapshot([
      binding('workspace', 'w-locked', 'direct', 'group-a'),
      binding('workspace', 'w-open', 'direct', 'group-b'),
    ]))
    await store.refresh()
    await store.unlock('group-b', 'password')
    const provider = createVaultAccessProvider(store)

    expect(provider.sessionState('s-implicit', 'w-locked')).toEqual({ kind: 'blocked', reason: 'Vault group locked' })
    expect(provider.sessionState('s-implicit', 'w-open')).toEqual({ kind: 'allow' })
    expect(provider.sessionState('s-implicit').kind).toBe('blocked')
    // Fail closed: with workspace protection present and ownership unknown the
    // provider must claim the session so DSH cannot open it unchecked.
    expect(provider.matchesSession('s-implicit')).toBe(true)
    expect(provider.matchesSession('s-unknown')).toBe(true)
  })

  it('rechecks the current session immediately after its workspace is locked', async () => {
    const store = makeStore(makeSnapshot([binding('workspace', 'w-locked', 'direct', 'group-a')]))
    await store.refresh()
    rememberWorkspaceIdForSession('s-current', 'w-locked')
    const provider = createVaultAccessProvider(store)
    expect(provider.sessionState('s-current')).toEqual({ kind: 'blocked', reason: 'Vault group locked' })
  })

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

    await expect(provider.requestWorkspace('w-locked')).resolves.toEqual({ allow: true })

    const offline = makeStore(makeSnapshot([binding('workspace', 'w-locked', 'direct', 'group-a')]))
    await offline.refresh()
    const offlineProvider = createVaultAccessProvider(offline)
    await offline.lockAll()
    expect(offlineProvider.workspaceState('w-locked').kind).toBe('blocked')
  })

  it('does not open an unlock prompt when a locked workspace row is selected', async () => {
    const store = makeStore(makeSnapshot([
      binding('workspace', 'w-a', 'direct', 'group-a'),
      binding('workspace', 'w-b', 'direct', 'group-b'),
    ]))
    await store.refresh()
    const provider = createVaultAccessProvider(store)
    await expect(provider.requestWorkspace('w-a')).resolves.toEqual({ allow: true })
    await expect(provider.requestWorkspace('w-b')).resolves.toEqual({ allow: true })
    expect(store.getSnapshot().prompt).toBeNull()
  })

  it('allows selecting a locked session so the main pane can show its unlock page', async () => {
    const store = makeStore(makeSnapshot([binding('workspace', 'w-locked', 'direct', 'group-a')]))
    await store.refresh()
    rememberWorkspaceIdForSession('s-locked', 'w-locked')
    const provider = createVaultAccessProvider(store)
    await expect(provider.requestSession('s-locked')).resolves.toEqual({ allow: true })
    expect(store.getSnapshot().prompt).toBeNull()
  })

  it('records workspace context before allowing a locked session selection', async () => {
    const store = makeStore(makeSnapshot([binding('workspace', 'w-locked', 'direct', 'group-a')]))
    await store.refresh()
    const provider = createVaultAccessProvider(store)
    await provider.requestSession('s-context', 'w-locked')
    expect(provider.sessionState('s-context')).toEqual({ kind: 'blocked', reason: 'Vault group locked' })
  })

  it('allows an already unlocked direct group without opening a prompt', async () => {
    const store = makeStore(makeSnapshot([binding('workspace', 'w-a', 'direct', 'group-a')]))
    await store.refresh()
    await store.unlock('group-a', 'password')
    const provider = createVaultAccessProvider(store)
    await expect(provider.requestWorkspace('w-a')).resolves.toEqual({ allow: true })
    expect(store.getSnapshot().prompt).toBeNull()
    expect(provider.workspaceState('w-a')).toEqual({ kind: 'allow' })
  })

  it('does not claim or block a session whose workspace is confirmed absent', async () => {
    const store = makeStore(makeSnapshot([binding('workspace', 'w-locked', 'direct', 'group-a')]))
    await store.refresh()
    const provider = createVaultAccessProvider(store)

    // Host-confirmed "no parent workspace": nothing to inherit, so even with
    // workspace protection configured elsewhere the session must open.
    expect(provider.matchesSession('s-fresh', null)).toBe(false)
    expect(provider.sessionState('s-fresh', null)).toEqual({ kind: 'allow' })
  })

  it('honours host-provided workspace context for match and state probes', async () => {
    const store = makeStore(makeSnapshot([
      binding('workspace', 'w-locked', 'direct', 'group-a'),
    ]))
    await store.refresh()
    const provider = createVaultAccessProvider(store)

    // Plain workspace context: the provider must not claim the session.
    expect(provider.matchesSession('s-new', 'w-plain')).toBe(false)
    expect(provider.sessionState('s-new', 'w-plain')).toEqual({ kind: 'allow' })
    // Locked workspace context: claim and block until unlock.
    expect(provider.matchesSession('s-new', 'w-locked')).toBe(true)
    expect(provider.sessionState('s-new', 'w-locked')).toEqual({ kind: 'blocked', reason: 'Vault group locked' })
  })

  it('still enforces explicit session bindings when the workspace is confirmed absent', async () => {
    const store = makeStore(makeSnapshot([
      binding('workspace', 'w-locked', 'direct', 'group-a'),
      binding('session', 's-direct', 'direct', 'group-b'),
    ]))
    await store.refresh()
    const provider = createVaultAccessProvider(store)

    expect(provider.matchesSession('s-direct', null)).toBe(true)
    expect(provider.sessionState('s-direct', null)).toEqual({ kind: 'blocked', reason: 'Vault group locked' })
  })
})
