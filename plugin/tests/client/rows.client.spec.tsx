/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultRowAccessory } from '../../src/client/rows/VaultRowAccessory.js'
import { VaultRowAction } from '../../src/client/rows/VaultRowAction.js'
import { createVaultRowDecorator, rememberWorkspaceIdForSession } from '../../src/client/rows/presentation.js'
import type { VaultClientStore } from '../../src/client/store.js'

afterEach(() => cleanup())

// getSnapshot must return a stable reference (same contract as the real store),
// otherwise useSyncExternalStore loops on every render.
const fixed = <T,>(value: T) => () => value

describe('Vault row affordances', () => {
  it('announces an independently protected locked row without exposing its real name', () => {
    render(<VaultRowAccessory locked kind="session" inherited={false} onUnlock={() => undefined} />)

    expect(screen.getByRole('status')).toHaveTextContent('已上锁')
    expect(screen.getByRole('status')).toHaveTextContent('受保护')
    expect(document.querySelector('.dsh-vault-protected-lock-icon')).toBeInTheDocument()
    expect(document.querySelector('.dsh-vault-lock-icon')).toBeNull()
    expect(screen.queryByText('Secret session')).toBeNull()
  })

  it('labels an inherited lock as project protection', () => {
    render(<VaultRowAccessory locked kind="session" inherited onUnlock={() => undefined} />)

    expect(screen.getByRole('status')).toHaveTextContent('继承项目保护')
  })

  it('does not expose an unlock action in a locked list row', () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [{ id: 'group-a' }], bindings: [{ targetType: 'session', targetId: 'session-a', mode: 'direct', passwordGroupId: 'group-a' }], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction locked kind="session" sessionId="session-a" workspaceId="workspace-a" store={store} />)
    expect(screen.queryByRole('button', { name: '解锁' })).toBeNull()
  })

  it('does not offer a second lock for a session that inherits a locked workspace', () => {
    rememberWorkspaceIdForSession('session-inherited', 'workspace-locked')
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [{ id: 'group-workspace' }], bindings: [{ targetType: 'workspace', targetId: 'workspace-locked', mode: 'direct', passwordGroupId: 'group-workspace' }], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="session" sessionId="session-inherited" store={store} />)

    expect(screen.queryByRole('button', { name: '上锁' })).toBeNull()
  })

  it('explains inherited workspace protection before collecting a session password', () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [{ id: 'group-workspace' }], bindings: [{ targetType: 'workspace', targetId: 'workspace-protected', mode: 'direct', passwordGroupId: 'group-workspace' }], policy: {} as never, unlockedGroupIds: new Set(['group-workspace']), prompt: null }),
      hasUnlockedGroup: () => true,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="session" sessionId="session-inherited-open" workspaceId="workspace-protected" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '上锁' }))

    expect(screen.getByRole('dialog', { name: '不能单独上锁' })).toHaveTextContent('此对话已继承工作区保护')
    expect(screen.getByRole('dialog', { name: '不能单独上锁' })).toHaveTextContent('请在工作区级别管理保护')
    expect(screen.queryByLabelText('密码')).toBeNull()
    expect(screen.queryByRole('button', { name: '保存并上锁' })).toBeNull()
    expect(screen.getByRole('button', { name: '知道了' })).toBeVisible()
  })

  it('does not collect a session password when DSH omits workspace context after a workspace is protected', () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [{ id: 'group-workspace' }], bindings: [{ targetType: 'workspace', targetId: 'workspace-protected', mode: 'direct', passwordGroupId: 'group-workspace' }], policy: {} as never, unlockedGroupIds: new Set(['group-workspace']), prompt: null }),
      hasUnlockedGroup: () => true,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="session" sessionId="session-without-workspace-context" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '上锁' }))

    const dialog = screen.getByRole('dialog', { name: '不能单独上锁' })
    expect(dialog).toHaveTextContent('无法确认此对话的工作区归属')
    expect(dialog).toHaveTextContent('请在工作区级别管理保护')
    expect(screen.queryByLabelText('密码')).toBeNull()
    expect(screen.queryByRole('button', { name: '保存并上锁' })).toBeNull()
  })

  it('does not conceal an unbound session when workspace context is unavailable', () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [{ id: 'group-a' }], bindings: [{ targetType: 'workspace', targetId: 'locked-workspace', mode: 'direct', passwordGroupId: 'group-a' }], policy: { lockedNameVisibility: 'workspace-visible-session-hidden' } }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    const decorator = createVaultRowDecorator(store, () => 'Protected session')
    const base = { label: 'My unprotected session', ariaLabel: 'My unprotected session', concealed: false }
    expect(decorator.session?.('session-a', base)).toEqual(base)
  })

  it('opens the password dialog even before a password group exists', () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    expect(screen.getByRole('button', { name: '上锁' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '上锁' }))
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '123' } })
    expect(screen.getByText('密码至少需要 8 个字符')).toBeVisible()
    expect(screen.getByRole('dialog', { name: '设置密码并上锁' })).toBeVisible()
  })

  it('creates and binds a password group atomically from the row lock dialog', async () => {
    const createGroup = vi.fn(async () => ({ ok: true, value: { snapshot: {}, recoveryKey: 'recovery-key' } }))
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
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

  it('explains inherited workspace protection when a stale session lock dialog is refused', async () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
      createGroup: vi.fn(async () => ({ ok: false, error: { code: 'invalid-binding', message: 'nested session protection is not allowed' } })),
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="session" sessionId="session-a" workspaceId="workspace-a" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '上锁' }))
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并上锁' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('此对话已继承工作区保护')
    expect(alert).toHaveTextContent('请在工作区级别管理保护')
    expect(screen.getByRole('button', { name: '保存并上锁' })).toBeDisabled()
  })

  it('renders a lock button when a password group exists and can be used for direct protection', () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [{ id: 'group-a' }], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    expect(screen.getByRole('button', { name: '上锁' })).toBeVisible()
  })

  it('opens the password dialog without requiring a pre-existing password group', () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    fireEvent.click(screen.getByRole('button', { name: '上锁' }))
    expect(screen.getByRole('dialog', { name: '设置密码并上锁' })).toBeVisible()
  })

  it('shows confirmation mismatch inline when saving', () => {
    const store = {
      getSnapshot: fixed({ host: 'ready', groups: [], bindings: [], policy: { passwordPolicy: { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false } }, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
      createGroup: vi.fn(async () => ({ ok: true, value: { snapshot: {}, recoveryKey: 'recovery-key' } })),
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)
    fireEvent.click(screen.getByRole('button', { name: '上锁' }))
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'wrong horse' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并上锁' }))
    expect(screen.getByRole('alert')).toHaveTextContent('两次密码不一致')
  })

})
