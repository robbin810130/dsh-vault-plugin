/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupWizard } from '../../src/client/settings/GroupWizard.js'
import type { VaultClientStore } from '../../src/client/store.js'

afterEach(() => cleanup())

function wizardStore(overrides: Partial<VaultClientStore> = {}): VaultClientStore {
  return {
    clientInstanceId: 'client',
    createGroup: vi.fn(async () => ({
      ok: true,
      value: {
        snapshot: { revision: 8, policy: {} as never, groups: [], bindings: [] },
        recoveryKey: 'recovery-secret',
      },
    })),
    ...overrides,
  } as unknown as VaultClientStore
}

describe('Vault group wizard', () => {
  it('requires matching passwords before creating a group', async () => {
    const current = wizardStore()
    render(<GroupWizard store={current} />)

    fireEvent.change(screen.getByLabelText('密码组名称'), { target: { value: '研发组' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'wrong horse' } })
    fireEvent.click(screen.getByRole('button', { name: '创建密码组' }))

    expect(screen.getByText('两次密码不一致')).toBeVisible()
    expect(current.createGroup).not.toHaveBeenCalled()
  })

  it('rejects passwords shorter than the Host minimum', () => {
    const current = wizardStore()
    render(<GroupWizard store={current} />)
    fireEvent.change(screen.getByLabelText('密码组名称'), { target: { value: '研发组' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'short' } })
    expect(screen.getByRole('button', { name: '创建密码组' })).toBeDisabled()
    expect(current.createGroup).not.toHaveBeenCalled()
  })

  it('shows a one-time recovery key only after successful creation', async () => {
    const current = wizardStore()
    render(<GroupWizard store={current} />)

    fireEvent.change(screen.getByLabelText('密码组名称'), { target: { value: '研发组' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: '创建密码组' }))

    await waitFor(() => expect(current.createGroup).toHaveBeenCalledWith({ name: '研发组', password: 'correct horse', bindings: [] }))
    expect(screen.getByText('recovery-secret')).toBeVisible()
    expect(JSON.stringify(current)).not.toContain('correct horse')
  })
})
