import './styles.css'
import type { Context } from '@deepseek-ai/cordis'
import { createVaultApiClient } from './api.js'
import { createVaultAccessProvider } from './access/provider.js'
import { createVaultRowDecorator } from './rows/presentation.js'
import { createVaultClientStore } from './store.js'

export const inject = ['slots', 'locale', 'settingsScope', 'navigationAccess', 'workspaceRows'] as const

interface ClientContext extends Context {
  readonly locale: { t?: (key: string) => string }
  readonly navigationAccess: { register(provider: unknown): () => void }
  readonly workspaceRows: { register(decorator: unknown): () => void }
}

export function apply(ctx: ClientContext): void {
  const store = createVaultClientStore(createVaultApiClient())
  void store.refresh()
  ctx.effect(() => {
    const translate = (key: 'workspace' | 'session'): string => ctx.locale.t?.(`dsh-vault.protected-${key}`) ?? `Protected ${key}`
    const access = createVaultAccessProvider(store)
    const rows = createVaultRowDecorator(store, translate)
    const disposeAccess = ctx.navigationAccess.register(access)
    const disposeRows = ctx.workspaceRows.register(rows)
    return () => {
      ;(access as { dispose?: () => void }).dispose?.()
      disposeAccess()
      disposeRows()
    }
  }, 'dsh-vault/client')
}

apply.inject = inject
