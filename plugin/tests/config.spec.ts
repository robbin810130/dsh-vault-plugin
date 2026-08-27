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
      passwordPolicy: { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false },
    })
  })

  it.each([
    { failedAttemptProtection: { maxAttempts: 0 } },
    { failedAttemptProtection: { cooldownSeconds: 0 } },
    { passwordPolicy: { minLength: 3 } },
    { autoLockMinutes: 10 },
  ])('rejects invalid policy input %#', (input) => {
    expect(() => VaultPolicySchema(input as never)).toThrow()
  })
})

describe('ConfigSchema', () => {
  it('accepts omitted state directory so the resolver can use DSH defaults', () => {
    expect(ConfigSchema({})).toEqual({})
  })

  it('accepts an absolute explicit state directory', () => {
    expect(ConfigSchema({ stateDir: '/var/lib/dsh/vault-lock' })).toEqual({
      stateDir: '/var/lib/dsh/vault-lock',
    })
  })

  it('rejects a non-absolute explicit state directory', () => {
    expect(() => ConfigSchema({ stateDir: 'vault-lock' })).toThrow()
  })

  it('uses DSH_HOME/vault-lock before the homedir fallback', () => {
    expect(resolveStateDirectory(undefined, { DSH_HOME: '/dsh-home', DSH_VAULT_STATE_DIR: undefined }))
      .toBe('/dsh-home/vault-lock')
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

  it('gives explicit, vault-env, DSH_HOME, and fallback paths their canonical priority', () => {
    const environment = { DSH_VAULT_STATE_DIR: '/env/vault-lock', DSH_HOME: '/dsh-home' }
    expect(resolveStateDirectory(undefined, environment)).toBe('/env/vault-lock')
    expect(resolveStateDirectory('/explicit/vault-lock', environment)).toBe('/explicit/vault-lock')
    expect(resolveStateDirectory(undefined, { DSH_HOME: '/dsh-home' })).toBe('/dsh-home/vault-lock')
    expect(resolveStateDirectory(undefined, {})).toBe(join(homedir(), '.dsh', 'vault-lock'))
  })

  it('rejects every relative supplied path even when a higher-priority source wins', () => {
    expect(() => resolveStateDirectory(undefined, { DSH_HOME: 'relative-home' })).toThrow()
    expect(() => resolveStateDirectory('/explicit/vault-lock', { DSH_VAULT_STATE_DIR: '/env/vault-lock', DSH_HOME: 'relative-home' })).toThrow()
    expect(() => resolveStateDirectory(undefined, { DSH_VAULT_STATE_DIR: 'relative-vault', DSH_HOME: '/dsh-home' })).toThrow()
  })
})
