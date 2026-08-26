import './styles.css'
import type { Context } from '@deepseek-ai/cordis'
import { createVaultApiClient } from './api.js'
import { createVaultAccessProvider } from './access/provider.js'
import { createVaultRowDecorator } from './rows/presentation.js'
import { createVaultClientStore } from './store.js'
import { createVaultUnlockController } from './unlock/controller.js'
import { LockedConversation } from './unlock/LockedConversation.js'
import { UnlockDialog } from './unlock/UnlockDialog.js'
import { VaultRowAccessory } from './rows/VaultRowAccessory.js'
import { VaultRowAction } from './rows/VaultRowAction.js'
import { VaultSettingsCard } from './settings/VaultSettingsCard.js'

export const inject = ['slots', 'locale', 'settingsScope', 'navigationAccess', 'workspaceRows'] as const

interface ClientContext extends Context {
  readonly locale: { t?: (key: string) => string }
  readonly navigationAccess: { register(provider: unknown): () => void }
  readonly workspaceRows: { register(decorator: unknown): () => void }
}

export function apply(ctx: ClientContext): void {
  const store = createVaultClientStore(createVaultApiClient())
  const unlock = createVaultUnlockController(store)
  unlock.attach()
  void store.refresh()
  ctx.effect(() => {
    const translate = (key: 'workspace' | 'session'): string => ctx.locale.t?.(`dsh-vault.protected-${key}`) ?? `Protected ${key}`
    const access = createVaultAccessProvider(store)
    const rows = createVaultRowDecorator(store, translate)
    const disposeAccess = ctx.navigationAccess.register(access)
    const disposeRows = ctx.workspaceRows.register(rows)
    const disposeUnlock = ctx.slots.inject('shell.overlay', () => ctx.slots.register(
      { name: 'shell.overlay', id: 'dsh-vault-unlock', order: 40 },
      UnlockDialog,
    ))
    const disposeDenied = ctx.slots.inject('conversation.access.denied', () => ctx.slots.register(
      { name: 'conversation.access.denied' },
      LockedConversation,
    ))
    const disposeWorkspaceAccessory = ctx.slots.inject('sidebar.workspaces.workspace.accessory', () => ctx.slots.register(
      { name: 'sidebar.workspaces.workspace.accessory' },
      VaultRowAccessory,
    ))
    const disposeWorkspaceAction = ctx.slots.inject('sidebar.workspaces.workspace.action', () => ctx.slots.register(
      { name: 'sidebar.workspaces.workspace.action' },
      VaultRowAction,
    ))
    const disposeSessionAccessory = ctx.slots.inject('sidebar.workspaces.session.accessory', () => ctx.slots.register(
      { name: 'sidebar.workspaces.session.accessory' },
      VaultRowAccessory,
    ))
    const disposeSessionAction = ctx.slots.inject('sidebar.workspaces.session.action', () => ctx.slots.register(
      { name: 'sidebar.workspaces.session.action' },
      VaultRowAction,
    ))
    const disposeSettings = ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
      { name: 'settings.plugin.item', key: 'dsh-vault', locale: 'settings.dshVault', inject: () => ({ store }) },
      VaultSettingsCard,
    ))
    return () => {
      ;(access as { dispose?: () => void }).dispose?.()
      disposeAccess()
      disposeRows()
      disposeUnlock()
      disposeDenied()
      disposeWorkspaceAccessory()
      disposeWorkspaceAction()
      disposeSessionAccessory()
      disposeSessionAction()
      disposeSettings()
      unlock.detach()
    }
  }, 'dsh-vault/client')
}

apply.inject = inject
