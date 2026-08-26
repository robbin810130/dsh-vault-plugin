import { describe, expect, it } from 'vitest'
import { createVaultRowDecorator } from '../../src/client/rows/presentation.js'
import type { VaultClientStore } from '../../src/client/store.js'

const workspace = {
  label: 'Secret workspace', detail: '/private/path', copyText: '/private/path', tooltip: 'Secret workspace',
  ariaLabel: 'Open Secret workspace', concealed: false,
}
const session = {
  label: 'Secret session', workspaceLabel: 'Secret workspace', snippet: 'secret snippet', detail: 'secret detail',
  copyText: 'secret copy', tooltip: 'Secret tooltip', ariaLabel: 'Open Secret session', concealed: false,
}

function store(policy: 'workspace-visible-session-hidden' | 'all-visible' | 'all-hidden', unlocked: readonly string[] = []): VaultClientStore {
  return {
    clientInstanceId: 'client',
    getSnapshot: () => ({
      host: 'ready', revision: 1, groups: [{ id: 'group-a', name: 'redacted', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 1 }], unlockedGroupIds: new Set(unlocked), prompt: null,
      policy: { lockedNameVisibility: policy },
      bindings: [
        { targetType: 'workspace', targetId: 'w-locked', mode: 'direct', passwordGroupId: 'group-a', createdAt: 'now', updatedAt: 'now' },
        { targetType: 'session', targetId: 's-locked', workspaceId: 'w-locked', mode: 'inherit', createdAt: 'now', updatedAt: 'now' },
        { targetType: 'session', targetId: 's-plain', mode: 'no-inherit', createdAt: 'now', updatedAt: 'now' },
      ],
    }),
    hasUnlockedGroup: groupId => unlocked.includes(groupId),
    subscribe: () => () => {},
  } as unknown as VaultClientStore
}

function movedStore(): VaultClientStore {
  return {
    clientInstanceId: 'client',
    getSnapshot: () => ({
      host: 'ready', revision: 1,
      groups: [
        { id: 'group-a', name: 'old', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 1 },
        { id: 'group-b', name: 'new', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 1 },
      ],
      unlockedGroupIds: new Set(['group-a']), prompt: null,
      policy: { lockedNameVisibility: 'workspace-visible-session-hidden' },
      bindings: [
        { targetType: 'workspace', targetId: 'w-old', mode: 'direct', passwordGroupId: 'group-a', createdAt: 'now', updatedAt: 'now' },
        { targetType: 'workspace', targetId: 'w-new', mode: 'direct', passwordGroupId: 'group-b', createdAt: 'now', updatedAt: 'now' },
        { targetType: 'session', targetId: 's-moved', workspaceId: 'w-old', mode: 'inherit', createdAt: 'now', updatedAt: 'now' },
      ],
    }),
    hasUnlockedGroup: groupId => groupId === 'group-a',
    subscribe: () => () => {},
  } as unknown as VaultClientStore
}

describe('Vault locked-name presentation', () => {
  it.each([
    ['workspace-visible-session-hidden' as const, false, true],
    ['all-visible' as const, false, false],
    ['all-hidden' as const, true, true],
  ])('applies %s and removes every locked-name surface', (policy, workspaceConcealed, sessionConcealed) => {
    const decorator = createVaultRowDecorator(store(policy), key => key === 'workspace' ? 'Protected workspace' : 'Protected session')
    const visibleWorkspace = decorator.workspace?.('w-locked', workspace)
    const visibleSession = decorator.session?.('s-locked', session)
    expect(visibleWorkspace?.concealed).toBe(workspaceConcealed)
    expect(visibleSession?.concealed).toBe(sessionConcealed)
    if (sessionConcealed) {
      expect(visibleSession).toEqual({ label: 'Protected session', ariaLabel: 'Protected session', concealed: true })
      expect(JSON.stringify(visibleSession)).not.toContain('Secret')
      expect(JSON.stringify(visibleSession)).not.toContain('secret')
    }
  })

  it('allows unlocked targets and leaves plain targets untouched', () => {
    const decorator = createVaultRowDecorator(store('all-hidden', ['group-a']), key => key)
    expect(decorator.workspace?.('w-locked', workspace)).toEqual(workspace)
    expect(decorator.session?.('s-plain', { ...session, label: 'Plain', workspaceLabel: undefined })).toEqual({
      ...session, label: 'Plain', workspaceLabel: undefined,
    })
  })

  it('conceals a moved inherited session using the current workspace', () => {
    const decorator = createVaultRowDecorator(movedStore(), key => key)
    expect(decorator.session?.('s-moved', session, 'w-new')).toEqual({
      label: 'session', ariaLabel: 'session', concealed: true,
    })
  })

  it('conceals an implicitly inherited session in a locked current workspace', () => {
    const implicitStore = movedStore()
    const snapshot = implicitStore.getSnapshot()
    const withoutSessionBinding = snapshot.bindings.filter(binding => binding.targetType !== 'session')
    const store = {
      ...implicitStore,
      getSnapshot: () => ({ ...snapshot, bindings: withoutSessionBinding }),
    } as VaultClientStore
    const decorator = createVaultRowDecorator(store, key => key)

    expect(decorator.session?.('s-implicit', session, 'w-new')).toEqual({
      label: 'session', ariaLabel: 'session', concealed: true,
    })
  })
})
