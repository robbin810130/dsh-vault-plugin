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
      ],
    }),
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
})
