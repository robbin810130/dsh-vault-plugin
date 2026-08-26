/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupsPanel } from '../../src/client/settings/GroupsPanel.js'
import type { VaultClientStore } from '../../src/client/store.js'

afterEach(() => cleanup())

function groupsStore(overrides: Partial<VaultClientStore> = {}): VaultClientStore {
  return {
    clientInstanceId: 'client',
    getSnapshot: () => ({
      host: 'ready',
      revision: 3,
      groups: [{
        id: 'group-a',
        name: '研发组',
        credentialVersion: 1,
        recoveryConfigured: true,
        recoveryGeneratedAt: '2026-08-26T00:00:00.000Z',
        memberCount: 2,
      }],
      bindings: [],
      policy: {} as never,
      unlockedGroupIds: new Set(['group-a']),
      prompt: null,
    }),
    lockGroup: vi.fn(async () => ({ ok: true, value: null })),
    ...overrides,
  } as unknown as VaultClientStore
}

describe('Vault groups panel', () => {
  it('offers named group actions and manually locks the selected group', async () => {
    const store = groupsStore()
    render(<GroupsPanel store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '锁定 研发组' }))

    await waitFor(() => expect(store.lockGroup).toHaveBeenCalledWith('group-a'))
    expect(screen.getByRole('button', { name: '修改密码 研发组' })).toBeVisible()
    expect(screen.getByRole('button', { name: '恢复 研发组' })).toBeVisible()
  })

  it('opens password change and recovery workflows for the selected group', () => {
    const store = groupsStore()
    render(<GroupsPanel store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '修改密码 研发组' }))
    expect(screen.getByRole('heading', { name: '修改密码：研发组' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    fireEvent.click(screen.getByRole('button', { name: '恢复 研发组' }))
    expect(screen.getByRole('heading', { name: '恢复密码组：研发组' })).toBeVisible()
  })

  it('requires an explicit migration or protection removal choice before deleting a group', async () => {
    const store = groupsStore({
      getSnapshot: () => ({
        host: 'ready', revision: 3,
        groups: [
          { id: 'group-a', name: '研发组', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 2 },
          { id: 'group-b', name: '运营组', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 0 },
        ],
        bindings: [], policy: {} as never, unlockedGroupIds: new Set(['group-a']), prompt: null,
      }),
      updateBindings: vi.fn(async () => ({ ok: true, value: {} as never })),
      hasUnlockedGroup: vi.fn(() => true),
      requestUnlock: vi.fn(async () => true),
    })
    render(<GroupsPanel store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '删除 研发组' }))
    expect(screen.getByRole('heading', { name: '删除密码组：研发组' })).toBeVisible()
    expect(screen.getByText('必须迁移成员或解除全部保护，不能直接删除。')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '迁移到 运营组' }))
    await waitFor(() => expect(store.updateBindings).toHaveBeenCalledWith({ kind: 'delete-group', groupId: 'group-a', moveToGroupId: 'group-b' }))
  })
})
