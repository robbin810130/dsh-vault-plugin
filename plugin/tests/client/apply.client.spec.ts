// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/client/index.js'

const LIST_SLOTS = new Set([
  'shell.overlay',
  'sidebar.workspaces.workspace.accessory',
  'sidebar.workspaces.workspace.action',
  'sidebar.workspaces.session.accessory',
  'sidebar.workspaces.session.action',
])

describe('Vault client composition', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers a stable id for every DSH list-slot contribution', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const registrations: Array<Record<string, unknown>> = []
    let cleanup: (() => void) | undefined
    const ctx = {
      locale: {},
      settingsScope: { bind: () => ({ set: vi.fn(async () => undefined) }) },
      navigationAccess: { register: () => () => undefined },
      workspaceRows: { register: () => () => undefined },
      slots: {
        inject: (_name: string, factory: () => unknown) => factory() as () => void,
        register: (config: Record<string, unknown>) => {
          if (LIST_SLOTS.has(config.name as string) && config.id === undefined) {
            throw new Error(`list slot \"${String(config.name)}\" requires options.id`)
          }
          registrations.push(config)
          return () => undefined
        },
      },
      effect: (factory: () => (() => void)) => { cleanup = factory() },
    }

    apply(ctx as never)

    expect(registrations
      .filter(config => LIST_SLOTS.has(config.name as string))
      .map(config => [config.name, config.id]))
      .toEqual([
        ['shell.overlay', 'dsh-vault-unlock'],
        ['sidebar.workspaces.workspace.accessory', 'dsh-vault-workspace-accessory'],
        ['sidebar.workspaces.workspace.action', 'dsh-vault-workspace-action'],
        ['sidebar.workspaces.session.accessory', 'dsh-vault-session-accessory'],
        ['sidebar.workspaces.session.action', 'dsh-vault-session-action'],
      ])
    cleanup?.()
  })
})
