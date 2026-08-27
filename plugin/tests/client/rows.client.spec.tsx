/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('toggles directly without opening a menu', () => {
    const onUnlock = vi.fn()
    render(<VaultRowAction locked onUnlock={onUnlock} onLock={() => undefined} />)

    const button = screen.getByRole('button', { name: '解锁' })
    fireEvent.click(button)
    expect(onUnlock).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens the password dialog even before a password group exists', () => {
    const store = {
      getSnapshot: () => ({ host: 'ready', groups: [], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    expect(screen.getByRole('button', { name: '上锁' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '上锁' }))
    expect(screen.getByRole('dialog', { name: '设置密码并上锁' })).toBeVisible()
  })

  it('creates and binds a password group atomically from the row lock dialog', async () => {
    const createGroup = vi.fn(async () => ({ ok: true, value: { snapshot: {}, recoveryKey: 'recovery-key' } }))
    const store = {
      getSnapshot: () => ({ host: 'ready', groups: [], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
      createGroup,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="session" sessionId="session-a" workspaceId="workspace-a" presentation={{ label: '我的对话' }} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: '上锁' }))
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并上锁' }))
    await vi.waitFor(() => expect(createGroup).toHaveBeenCalledWith(expect.objectContaining({ name: '我的对话', password: 'correct horse', bindings: [expect.objectContaining({ targetId: 'session-a', mode: 'direct' })] })))
  })

  it('renders a lock button when a password group exists and can be used for direct protection', () => {
    const store = {
      getSnapshot: () => ({ host: 'ready', groups: [{ id: 'group-a' }], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    expect(screen.getByRole('button', { name: '上锁' })).toBeVisible()
  })

  it('opens the password dialog without requiring a pre-existing password group', () => {
    const store = {
      getSnapshot: () => ({ host: 'ready', groups: [], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '上锁' }))
    expect(screen.getByRole('dialog', { name: '设置密码并上锁' })).toBeVisible()
  })

})
