import './styles.css'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createVaultApiClient } from './api.js'
import { createVaultAccessProvider } from './access/provider.js'
import { createVaultClientStore } from './store.js'
import { createVaultUnlockController } from './unlock/controller.js'
import { VaultOverlays } from './dialogs/VaultOverlays.js'
import { recoveryDeliveryFor } from './dialogs/recovery-delivery.js'
import { VaultRowAction } from './rows/VaultRowAction.js'
import { VaultRowAccessory } from './rows/VaultRowAccessory.js'
import { VaultSettingsCard } from './settings/VaultSettingsCard.js'
import { createActivityMonitor } from './activity/monitor.js'

export const inject = ['slots', 'locale', 'configForms', 'sessions', 'workspaces'] as const

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface ISessions {
    readonly openingAccess: { register(gate: (sessionId: string) => void | Promise<void>): () => void }
  }
}

interface ClientContext extends Context {
  readonly slots: {
    inject(name: string, factory: () => unknown): () => void
    register(config: Record<string, unknown>, component: unknown): unknown
  }
  readonly locale: { t?: (key: string) => string }
  readonly sessions: Context['sessions']
  readonly workspaces: Context['workspaces']
  readonly configForms: Context['configForms']
}

export function apply(ctx: ClientContext): void {
  const store = createVaultClientStore(createVaultApiClient())
  const unlock = createVaultUnlockController(store)
  const activity = createActivityMonitor(store)
  const form = ctx.configForms.get('dsh-vault')
  const policyScope = {
    set: async (field: string, value: unknown): Promise<void> => {
      const { revision } = form.getSnapshot()
      const accepted = await form.mutate([{ op: 'set', path: [field], value }], revision)
      if (!accepted) throw new Error('Vault policy update was rejected')
    },
  }
  unlock.attach()
  activity.start()
  void store.refresh()
  ctx.effect(() => {
    const access = createVaultAccessProvider(store)
    const disposeAccess = ctx.sessions.openingAccess.register(async (sessionId) => {
      const workspaceId = ctx.workspaces.list.getSnapshot().items
        .find(workspace => workspace.sessionIds.some(id => String(id) === sessionId))?.workspaceId ?? null
      const state = access.sessionState(sessionId, workspaceId)
      if (state.kind === 'blocked') throw new Error(state.reason)
    })
    const disposeUnlock = ctx.slots.inject('shell.overlay', () => ctx.slots.register(
      { name: 'shell.overlay', id: 'dsh-vault-unlock', order: 40 },
      VaultOverlays,
    ))
    const disposeSessionAction = ctx.slots.inject('sidebar.workspaces.session.row.action', () => ctx.slots.register(
      { name: 'sidebar.workspaces.session.row.action', id: 'dsh-vault-session-action', order: 400, inject: () => ({ store }) },
      VaultRowAction,
    ))
    const disposeWorkspaceAccessory = ctx.slots.inject('sidebar.workspaces.workspace.row.accessory', () => ctx.slots.register(
      { name: 'sidebar.workspaces.workspace.row.accessory', id: 'dsh-vault-workspace-accessory', order: 400, inject: () => ({ store }) },
      VaultRowAccessory,
    ))
    const disposeWorkspaceAction = ctx.slots.inject('sidebar.workspaces.workspace.row.action', () => ctx.slots.register(
      { name: 'sidebar.workspaces.workspace.row.action', id: 'dsh-vault-workspace-action', order: 400, inject: () => ({ store }) },
      VaultRowAction,
    ))
    const disposeSettings = ctx.configForms.whileServed(['dsh-vault'], () => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register(
      { name: 'settings.plugins.tab', id: 'dsh-vault', order: 90, label: '保险箱', inject: () => ({ store, policyScope }) },
      VaultSettingsCard,
    )))
    return () => {
      ;(access as { dispose?: () => void }).dispose?.()
      disposeAccess()
      disposeUnlock()
      disposeSessionAction()
      disposeWorkspaceAccessory()
      disposeWorkspaceAction()
      disposeSettings()
      recoveryDeliveryFor(store).dispose()
      unlock.detach()
      activity.stop()
    }
  }, 'dsh-vault/client')
}

apply.inject = inject
