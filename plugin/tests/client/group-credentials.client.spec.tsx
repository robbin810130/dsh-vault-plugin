/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupCredentials } from '../../src/client/settings/GroupCredentials.js'
import type { VaultClientStore } from '../../src/client/store.js'

afterEach(() => cleanup())

function credentialStore(overrides: Partial<VaultClientStore> = {}): VaultClientStore {
  return {
    clientInstanceId: 'client',
    changePassword: vi.fn(async () => ({
      ok: true,
      value: { snapshot: {} as never, recoveryKey: 'ROTATED-RECOVERY-KEY' },
    })),
    recoverGroup: vi.fn(async () => ({
      ok: true,
      value: { snapshot: {} as never, recoveryKey: 'NEW-RECOVERY-KEY' },
    })),
    ...overrides,
  } as unknown as VaultClientStore
}

describe('Vault group credentials', () => {
  it('changes a password and optionally rotates the recovery key', async () => {
    const store = credentialStore()
    render(<GroupCredentials mode="change" groupId="group-a" groupName="研发组" store={store} />)

    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'old secret' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new secret' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new secret' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '同时轮换恢复密钥' }))
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }))

    await waitFor(() => expect(store.changePassword).toHaveBeenCalledWith({
      groupId: 'group-a', currentPassword: 'old secret', newPassword: 'new secret', rotateRecovery: true,
    }))
    expect(screen.getByText('ROTATED-RECOVERY-KEY')).toBeVisible()
    expect(screen.queryByDisplayValue('old secret')).toBeNull()
    expect(screen.queryByDisplayValue('new secret')).toBeNull()
  })

  it('recovers a group, replaces its password, and shows the new recovery key once', async () => {
    const store = credentialStore()
    render(<GroupCredentials mode="recover" groupId="group-a" groupName="研发组" store={store} />)

    fireEvent.change(screen.getByLabelText('恢复密钥'), { target: { value: 'OLD-RECOVERY-KEY' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'recovered secret' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'recovered secret' } })
    fireEvent.click(screen.getByRole('button', { name: '恢复密码组' }))

    await waitFor(() => expect(store.recoverGroup).toHaveBeenCalledWith({
      groupId: 'group-a', recoveryKey: 'OLD-RECOVERY-KEY', newPassword: 'recovered secret',
    }))
    expect(screen.getByText('NEW-RECOVERY-KEY')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.queryByText('NEW-RECOVERY-KEY')).toBeNull()
  })

  it('refuses mismatched password confirmation without sending secrets', () => {
    const store = credentialStore()
    render(<GroupCredentials mode="change" groupId="group-a" groupName="研发组" store={store} />)
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'old secret' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'one' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'two' } })
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }))
    expect(screen.getByRole('alert')).toHaveTextContent('两次密码不一致')
    expect(store.changePassword).not.toHaveBeenCalled()
  })
})
