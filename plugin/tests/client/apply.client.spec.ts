// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/client/index.js'

const LIST_SLOTS = new Set([
  'shell.overlay',
  'sidebar.workspaces.session.row.action',
  'sidebar.workspaces.workspace.row.action',
  'sidebar.workspaces.workspace.row.accessory',
  'sidebar.workspaces.workspace.row.title',
  'sidebar.workspaces.session.row.title',
  'conversation.session.header.title',
  'conversation.session.guard',
  'shell.document.title',
  'settings.plugins.tab',
])

describe('Vault client composition', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers a stable id for every DSH list-slot contribution', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const registrations: Array<Record<string, unknown>> = []
    let cleanup: (() => void) | undefined
    let openingGate: ((sessionId: string) => void | Promise<void>) | undefined
    const configForm = {
      getSnapshot: () => ({ revision: 1, status: 'ready' }),
      mutate: vi.fn(async () => true),
    }
    const ctx = {
      locale: {},
      sessions: { openingAccess: { register: (gate: typeof openingGate) => { openingGate = gate; return () => undefined } } },
      workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'project-a', sessionIds: ['locked-session'] }] }) } },
      configForms: {
        get: () => configForm,
        whileServed: (_ids: readonly string[], register: () => () => void) => register(),
      },
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
        ['sidebar.workspaces.session.row.action', 'dsh-vault-session-action'],
        ['sidebar.workspaces.workspace.row.accessory', 'dsh-vault-workspace-accessory'],
        ['sidebar.workspaces.workspace.row.action', 'dsh-vault-workspace-action'],
        ['sidebar.workspaces.workspace.row.title', 'dsh-vault-workspace-title'],
        ['sidebar.workspaces.session.row.title', 'dsh-vault-session-title'],
        ['conversation.session.header.title', 'dsh-vault-breadcrumb-title'],
        ['conversation.session.guard', 'dsh-vault-session-guard'],
        ['shell.document.title', 'dsh-vault-document-title'],
        ['settings.plugins.tab', 'dsh-vault'],
      ])
    await expect(openingGate?.('locked-session')).rejects.toThrow('Vault protection loading')
    cleanup?.()
  })
})
