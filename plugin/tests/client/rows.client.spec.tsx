/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultRowAccessory } from '../../src/client/rows/VaultRowAccessory.js'
import { VaultRowAction } from '../../src/client/rows/VaultRowAction.js'

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
})
