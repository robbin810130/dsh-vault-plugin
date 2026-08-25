import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { VaultPolicy } from '../config.js'
import { VaultPolicySchema } from '../config.js'
import type { VaultService } from './service.js'

export const DEFAULT_VAULT_POLICY: VaultPolicy = Object.freeze(VaultPolicySchema({}))

export interface VaultPolicySettingsController {
  readonly onChange: (policy: VaultPolicy) => void
}

export function createVaultPolicySettings(service: VaultService): VaultPolicySettingsController {
  return {
    onChange: (policy) => service.setPolicy(policy),
  }
}

export function installVaultPolicySettings(
  ctx: Context,
  service: VaultService,
  entry: VaultPolicy = DEFAULT_VAULT_POLICY,
): void {
  let source = () => entry
  const controller = createVaultPolicySettings(service)
  installSettingsSection(ctx, settingsNamespace('dsh-vault'), VaultPolicySchema, entry, {
    setSource: (current) => { source = current },
    onChange: () => controller.onChange(source()),
  })
  controller.onChange(source())
}
