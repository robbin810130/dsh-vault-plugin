import type { VaultPolicy } from '../config.js'
import { vaultPolicyFromConfig, VaultPolicySchema } from '../config.js'
import type { Config } from '../config.js'
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

export function applyVaultPolicyConfig(
  service: VaultService,
  entry: Config,
): void {
  createVaultPolicySettings(service).onChange(vaultPolicyFromConfig(entry))
}
