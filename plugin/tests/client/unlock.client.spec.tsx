/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VaultClientStore } from '../../src/client/store.js'
import { LockedConversation } from '../../src/client/unlock/LockedConversation.js'
import { UnlockDialog } from '../../src/client/unlock/UnlockDialog.js'

afterEach(() => cleanup())

function store(overrides: Partial<VaultClientStore> = {}): VaultClientStore {
  const snapshot = {
    host: 'ready' as const, revision: 1,
    groups: [{ id: 'group-a', name: 'Protected', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 1 }],
    bindings: [{ targetType: 'session' as const, targetId: 's-locked', mode: 'direct' as const, passwordGroupId: 'group-a', createdAt: 'now', updatedAt: 'now' }], policy: { autoLockMinutes: 15 as const, lockOnSystemSleep: true, lockedNameVisibility: 'all-hidden' as const, failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 } },
    unlockedGroupIds: new Set<string>(), prompt: { groupId: 'group-a', target: { type: 'session' as const, id: 's-locked', workspaceId: 'w-locked' } },
  }
  return {
    clientInstanceId: 'client',
    getSnapshot: () => snapshot,
    hasUnlockedGroup: () => false,
    subscribe: () => () => undefined,
    requestUnlock: vi.fn(async () => false),
    unlock: vi.fn(async () => ({ ok: false, error: { code: 'invalid-credentials', message: 'Vault operation failed' } })),
    settleUnlock: vi.fn(),
    cancelUnlock: vi.fn(),
    ...overrides,
  } as unknown as VaultClientStore
}

describe('Vault unlock surfaces', () => {
  it('renders an unbound conversation normally before any protection is configured', () => {
    const snapshot = {
      ...store().getSnapshot(),
      groups: [],
      bindings: [],
      prompt: null,
    }
    const current = store({
      getSnapshot: () => snapshot,
    })
    render(<LockedConversation sessionId="s-plain" store={current}>
      <p>ordinary assistant message</p>
    </LockedConversation>)

    expect(screen.getByText('ordinary assistant message')).toBeTruthy()
    expect(screen.queryByText('需要解锁才能查看内容')).toBeNull()
  })

  it('does not mount real conversation copy while locked', () => {
    render(<LockedConversation sessionId="s-locked" store={store()}>
      <p>secret assistant message</p>
    </LockedConversation>)

    expect(screen.getByText('需要解锁才能查看内容')).toBeTruthy()
    expect(screen.queryByText('secret assistant message')).toBeNull()
  })

  it('keeps the dialog submit disabled for an empty password and cancels on Escape', () => {
    const current = store()
    render(<UnlockDialog store={current} />)
    expect(screen.getByRole('dialog').parentElement?.parentElement).toBe(document.body)

    expect(screen.getByRole('button', { name: '解锁' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(current.cancelUnlock).toHaveBeenCalledWith('group-a')
  })

  it('preserves a wrong password for retry and settles after success', async () => {
    const current = store({
      unlock: vi.fn()
        .mockResolvedValueOnce({ ok: false, error: { code: 'invalid-credentials', message: 'Vault operation failed' } })
        .mockResolvedValueOnce({ ok: true, value: { grant: { groupId: 'group-a', credentialVersion: 1, token: 'x'.repeat(43) }, expiresAt: Date.now() + 30_000 } }),
    })
    render(<UnlockDialog store={current} />)
    const input = screen.getByLabelText('密码')
    fireEvent.change(input, { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: '解锁' }))
    await screen.findByText('密码不正确，请重试')
    expect(input).toHaveValue('correct horse')
    fireEvent.click(screen.getByRole('button', { name: '解锁' }))
    await waitFor(() => expect(current.settleUnlock).toHaveBeenCalledWith('group-a'))
  })
})
