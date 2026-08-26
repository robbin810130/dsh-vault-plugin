/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultRowAccessory } from '../../src/client/rows/VaultRowAccessory.js'
import { VaultRowAction } from '../../src/client/rows/VaultRowAction.js'
import type { VaultClientStore } from '../../src/client/store.js'

afterEach(() => cleanup())

describe('Vault row affordances', () => {
  it('announces an independently protected locked row without exposing its real name', () => {
    render(<VaultRowAccessory locked kind="session" inherited={false} onUnlock={() => undefined} />)

    expect(screen.getByRole('status')).toHaveTextContent('已上锁')
    expect(screen.getByRole('status')).toHaveTextContent('受保护')
    expect(screen.queryByText('Secret session')).toBeNull()
  })

  it('labels an inherited lock as project protection', () => {
    render(<VaultRowAccessory locked kind="session" inherited onUnlock={() => undefined} />)

    expect(screen.getByRole('status')).toHaveTextContent('继承项目保护')
  })

  it('opens a compact action menu and invokes unlock', () => {
    const onUnlock = vi.fn()
    render(<VaultRowAction locked onUnlock={onUnlock} onLock={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: '保险箱操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '解锁' }))
    expect(onUnlock).toHaveBeenCalledOnce()
  })

  it('protects a workspace with a selected password group after unlocking it', async () => {
    const store = {
      getSnapshot: () => ({
        host: 'ready', revision: 2, bindings: [],
        groups: [{ id: 'group-a', name: '研发组', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 0 }],
        policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null,
      }),
      hasUnlockedGroup: () => false,
      requestUnlock: vi.fn(async () => true),
      updateBindings: vi.fn(async () => ({ ok: true, value: {} as never })),
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '保险箱操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '使用 研发组 保护' }))

    await waitFor(() => expect(store.requestUnlock).toHaveBeenCalledWith('group-a', { type: 'workspace', id: 'workspace-a' }))
    expect(store.updateBindings).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'replace',
      binding: expect.objectContaining({ targetType: 'workspace', targetId: 'workspace-a', mode: 'direct', passwordGroupId: 'group-a' }),
    }))
  })

  it('lets a session explicitly opt out of inherited workspace protection', async () => {
    const store = {
      getSnapshot: () => ({
        host: 'ready', revision: 2,
        groups: [{ id: 'group-a', name: '研发组', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 1 }],
        bindings: [{ targetType: 'workspace', targetId: 'workspace-a', mode: 'direct', passwordGroupId: 'group-a', createdAt: 'now', updatedAt: 'now' }],
        policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null,
      }),
      hasUnlockedGroup: () => false,
      requestUnlock: vi.fn(async () => true),
      updateBindings: vi.fn(async () => ({ ok: true, value: {} as never })),
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="session" workspaceId="workspace-a" sessionId="session-a" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '保险箱操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '不继承项目保护' }))

    await waitFor(() => expect(store.requestUnlock).toHaveBeenCalledWith('group-a', { type: 'session', id: 'session-a', workspaceId: 'workspace-a' }))
    expect(store.updateBindings).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'replace',
      binding: expect.objectContaining({ targetType: 'session', targetId: 'session-a', workspaceId: 'workspace-a', mode: 'no-inherit' }),
    }))
  })

  it('directly overrides workspace protection for a session', async () => {
    const store = {
      getSnapshot: () => ({
        host: 'ready', revision: 2,
        groups: [
          { id: 'group-a', name: '研发组', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 1 },
          { id: 'group-b', name: '运营组', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 0 },
        ],
        bindings: [{ targetType: 'workspace', targetId: 'workspace-a', mode: 'direct', passwordGroupId: 'group-a', createdAt: 'now', updatedAt: 'now' }],
        policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null,
      }),
      hasUnlockedGroup: () => false,
      requestUnlock: vi.fn(async () => true),
      updateBindings: vi.fn(async () => ({ ok: true, value: {} as never })),
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="session" workspaceId="workspace-a" sessionId="session-a" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '保险箱操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '直接使用 运营组 保护' }))

    await waitFor(() => expect(store.requestUnlock).toHaveBeenCalledWith('group-b', { type: 'session', id: 'session-a', workspaceId: 'workspace-a' }))
    expect(store.updateBindings).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'replace',
      binding: expect.objectContaining({ targetType: 'session', targetId: 'session-a', workspaceId: 'workspace-a', mode: 'direct', passwordGroupId: 'group-b' }),
    }))
  })

  it('refreshes and reports a revision conflict instead of hiding the failure', async () => {
    const refresh = vi.fn(async () => ({ ok: true, value: {} as never }))
    const store = {
      getSnapshot: () => ({
        host: 'ready', revision: 2,
        groups: [{ id: 'group-a', name: '研发组', credentialVersion: 1, recoveryConfigured: true, recoveryGeneratedAt: 'now', memberCount: 0 }],
        bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null,
      }),
      hasUnlockedGroup: () => false,
      requestUnlock: vi.fn(async () => true),
      updateBindings: vi.fn(async () => ({ ok: false, error: { code: 'revision-conflict', message: 'conflict' } })),
      refresh,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '保险箱操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '使用 研发组 保护' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('配置已变化，已刷新，请重试')
    expect(refresh).toHaveBeenCalledOnce()
  })
})
