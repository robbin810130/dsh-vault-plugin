/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultSettingsCard } from '../../src/client/settings/VaultSettingsCard.js'
import type { VaultClientStore } from '../../src/client/store.js'

afterEach(() => cleanup())

function store(overrides: Partial<VaultClientStore> = {}): VaultClientStore {
  const snapshot = {
    host: 'ready' as const,
    revision: 7,
    groups: [],
    bindings: [],
    policy: {
      autoLockMinutes: 15 as const,
      lockOnSystemSleep: true,
      lockedNameVisibility: 'workspace-visible-session-hidden' as const,
      failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 },
    },
    unlockedGroupIds: new Set<string>(),
    prompt: null,
  }
  return {
    clientInstanceId: 'client',
    getSnapshot: () => snapshot,
    hasUnlockedGroup: () => false,
    subscribe: () => () => undefined,
    refresh: vi.fn(async () => ({ ok: true, value: snapshot })),
    lockAll: vi.fn(async () => ({ ok: true, value: null })),
    ...overrides,
  } as unknown as VaultClientStore
}

describe('Vault settings card', () => {
  it('can collapse independently from the surrounding plugin settings', () => {
    render(<VaultSettingsCard store={store()} />)

    const toggle = screen.getByRole('button', { name: /保险箱/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('自动锁定')).toBeNull()
  })

  it('shows policy defaults and the fixed一期 disclosure', () => {
    render(<VaultSettingsCard store={store()} />)

    expect(screen.getByRole('tab', { name: '锁定策略' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('自动锁定')).toHaveValue('15')
    expect(screen.getByText('一期仅控制 DSH 前台访问，原始会话文件未加密')).toBeVisible()
  })

  it('shows conditional failed-attempt fields and warning when disabled', () => {
    render(<VaultSettingsCard store={store()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: '失败尝试保护' }))
    expect(screen.getByText('关闭后不会累计失败次数或进入暂停期')).toBeVisible()
    expect(screen.queryByLabelText('最大尝试次数')).toBeNull()
  })

  it('persists policy edits through the DSH settings scope and refreshes Host policy', async () => {
    const current = store()
    const policyScope = { set: vi.fn(async () => undefined) }
    render(<VaultSettingsCard store={current} policyScope={policyScope} />)

    fireEvent.change(screen.getByLabelText('自动锁定'), { target: { value: '30' } })

    await vi.waitFor(() => {
      expect(policyScope.set).toHaveBeenCalledWith('autoLockMinutes', 30)
      expect(current.refresh).toHaveBeenCalled()
    })
  })

  it('locks all groups from the recovery tab', async () => {
    const current = store()
    render(<VaultSettingsCard store={current} />)
    fireEvent.click(screen.getByRole('tab', { name: '恢复能力' }))
    fireEvent.click(screen.getByRole('button', { name: '立即全部上锁' }))
    expect(current.lockAll).toHaveBeenCalledOnce()
  })
})
