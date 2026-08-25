import type { Context } from '@deepseek-ai/cordis'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { join } from 'node:path'
import type { Config as VaultConfig } from './config.js'
import { VaultPolicySchema } from './config.js'
import { createVaultApiHandler } from './host/api/handler.js'
import { VaultService } from './host/service.js'
import { VaultStateRepository } from './host/state/repository.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    readonly vault: VaultService
    webServer: WebServer
  }
}

export * from './config.js'
export * from './shared/contracts.js'

export const inject = ['webServer'] as const

export function apply(ctx: Context, config: VaultConfig): void {
  const stateDirectory = config.stateDir ?? join(process.env.DSH_HOME ?? process.cwd(), 'vault-lock')
  const service = new VaultService({
    repository: new VaultStateRepository(stateDirectory),
    policy: VaultPolicySchema({}),
  })
  ctx.provide('vault', service)
  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-vault/api',
      handler: createVaultApiHandler(service),
    })
    return () => {
      disposeRoute()
      service.dispose()
    }
  }, 'dsh-vault/api')
}

apply.inject = inject
