import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigSchema, resolveStateDirectory, VaultPolicySchema } from '../src/config.js'

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

  it('defaults to the DSH authority directory under the user home', () => {
    expect(resolveStateDirectory(undefined, { DSH_HOME: '/wrong', DSH_VAULT_STATE_DIR: undefined }))
      .toBe(join(homedir(), '.dsh', 'vault-lock'))
  })

  it('uses the environment override, then gives an absolute explicit path precedence', () => {
    const environment = { DSH_VAULT_STATE_DIR: '/env/vault-lock' }
    expect(resolveStateDirectory(undefined, environment)).toBe('/env/vault-lock')
    expect(resolveStateDirectory('/flag/vault-lock', environment)).toBe('/flag/vault-lock')
  })

  it('rejects relative environment and explicit state directories', () => {
    expect(() => resolveStateDirectory(undefined, { DSH_VAULT_STATE_DIR: 'relative-vault' })).toThrow()
    expect(() => resolveStateDirectory('relative-vault', {})).toThrow()
  })
})
