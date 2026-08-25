import { describe, expect, it } from 'vitest'
import { ConfigSchema, VaultPolicySchema } from '../src/config.js'

describe('VaultPolicySchema', () => {
  it('normalizes the documented policy defaults', () => {
    expect(VaultPolicySchema({})).toEqual({
      autoLockMinutes: 15,
      lockOnSystemSleep: true,
      lockedNameVisibility: 'workspace-visible-session-hidden',
      failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 },
    })
  })

  it.each([
    { failedAttemptProtection: { maxAttempts: 0 } },
    { failedAttemptProtection: { cooldownSeconds: 0 } },
    { autoLockMinutes: 10 },
  ])('rejects invalid policy input %#', (input) => {
    expect(() => VaultPolicySchema(input as never)).toThrow()
  })
})

describe('ConfigSchema', () => {
  it('accepts an absolute explicit state directory', () => {
    expect(ConfigSchema({ stateDir: '/var/lib/dsh/vault-lock' })).toEqual({
      stateDir: '/var/lib/dsh/vault-lock',
    })
  })

  it('rejects a non-absolute explicit state directory', () => {
    expect(() => ConfigSchema({ stateDir: 'vault-lock' })).toThrow()
  })
})
