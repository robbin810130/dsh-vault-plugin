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

  it('does not render an inert lock button before a password group exists', () => {
    const store = {
      getSnapshot: () => ({ host: 'ready', groups: [], bindings: [], policy: {} as never, unlockedGroupIds: new Set<string>(), prompt: null }),
      hasUnlockedGroup: () => false,
    } as unknown as VaultClientStore
    render(<VaultRowAction kind="workspace" workspaceId="workspace-a" store={store} />)

    expect(screen.queryByRole('button')).toBeNull()
  })

})
