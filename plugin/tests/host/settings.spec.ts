import { describe, expect, it } from 'vitest'
import { ConfigSchema, VaultPolicySchema } from '../../src/config.js'
import { applyVaultPolicyConfig, DEFAULT_VAULT_POLICY, createVaultPolicySettings } from '../../src/host/settings.js'
import { VaultService } from '../../src/host/service.js'
import { emptyVaultState } from '../../src/host/state/schema.js'

describe('DSH Vault policy settings', () => {
  it('exposes only the documented non-sensitive defaults', () => {
    expect(DEFAULT_VAULT_POLICY).toEqual(VaultPolicySchema({}))
    const serialized = JSON.stringify(VaultPolicySchema.toJSON())
    expect(serialized).not.toMatch(/recovery|verifier|token/i)
  })

  it('adopts a live policy update for failed-attempt protection', async () => {
    const repository = {
      load: async () => emptyVaultState(),
      commit: async () => ({ ok: true as const, revision: 1 }),
      appendAudit: async () => undefined,
    }
    const service = new VaultService({ repository, policy: DEFAULT_VAULT_POLICY })
    const setting = createVaultPolicySettings(service)

    setting.onChange({
      ...DEFAULT_VAULT_POLICY,
      failedAttemptProtection: {
        ...DEFAULT_VAULT_POLICY.failedAttemptProtection,
        enabled: false,
      },
    })

    expect(service.policy.failedAttemptProtection.enabled).toBe(false)
    expect(service.policy.autoLockMinutes).toBe(DEFAULT_VAULT_POLICY.autoLockMinutes)
  })

  it('keeps failed-attempt policy validation fail-closed', () => {
    expect(() => VaultPolicySchema({
      failedAttemptProtection: { maxAttempts: 0 },
    } as never)).toThrow()
  })

  it('applies the policy from the DSH 0.1.7 plugin config', () => {
    const service = new VaultService({
      repository: {
        load: async () => emptyVaultState(),
        commit: async () => ({ ok: true as const, revision: 1 }),
        appendAudit: async () => undefined,
      },
      policy: DEFAULT_VAULT_POLICY,
    })
    const policy = VaultPolicySchema({ autoLockMinutes: 30 })
    applyVaultPolicyConfig(service, ConfigSchema({ autoLockMinutes: 30 }))
    expect(service.policy).toEqual(policy)
  })
})
