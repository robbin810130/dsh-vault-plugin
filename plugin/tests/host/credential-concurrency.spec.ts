import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { VaultPolicy } from '../../src/config.js'
import type { VaultApiRequest } from '../../src/shared/contracts.js'
import { FailedAttemptStore } from '../../src/host/auth/attempts.js'
import * as crypto from '../../src/host/crypto/verifier.js'
import { VaultService, type VaultRepository } from '../../src/host/service.js'
import { VaultStateLockError } from '../../src/host/state/repository.js'
import type { VaultState } from '../../src/host/state/model.js'

const policy: VaultPolicy = {
  autoLockMinutes: 0, lockOnSystemSleep: true, lockedNameVisibility: 'all-hidden',
  failedAttemptProtection: { enabled: true, maxAttempts: 2, cooldownSeconds: 10 },
  passwordPolicy: { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false },
}
const password = 'correct horse'
const recoveryKey = 'recovery secret'
const realVerify = crypto.verifySecret
let initial: VaultState
beforeAll(async () => {
  const group = { id: 'g', name: 'Group', password: await crypto.createVerifier(password), recovery: { ...await crypto.createVerifier(recoveryKey), generatedAt: 'now' }, credentialVersion: 1, createdAt: 'now', updatedAt: 'now' }
  initial = { schemaVersion: 1, revision: 1, groups: { g: group }, bindings: [] }
})
afterEach(() => vi.restoreAllMocks())

function barrier() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}
function fixture(overrides: Partial<VaultRepository> = {}, selectedPolicy = policy) {
  let state = structuredClone(initial)
  const repository: VaultRepository = {
    load: async () => structuredClone(state),
    commit: async (revision, next) => {
      if (state.revision !== revision) return { ok: false, code: 'revision-conflict' }
      state = structuredClone(next)
      return { ok: true, revision: next.revision }
    },
    appendAudit: async () => {},
    ...overrides,
  }
  return new VaultService({ repository, policy: selectedPolicy, attempts: new FailedAttemptStore({ monotonicNow: () => 100, wallNow: () => 1000 }) })
}
type Route = 'unlock' | 'change-password' | 'change-recovery' | 'recover'
function request(route: Route, secret: string, clientInstanceId = 'client'): VaultApiRequest {
  if (route === 'unlock') return { action: 'unlock', clientInstanceId, groupId: 'g', password: secret }
  if (route === 'recover') return { action: 'group-recover', clientInstanceId, expectedRevision: 1, input: { groupId: 'g', recoveryKey: secret, newPassword: 'new password' } }
  return { action: 'group-change-password', clientInstanceId, expectedRevision: 1, input: { groupId: 'g', ...(route === 'change-password' ? { currentPassword: secret } : { recoveryKey: secret }), newPassword: 'new password', rotateRecovery: false } }
}
function holdFirstVerification() {
  const entered = barrier()
  const resume = barrier()
  let calls = 0
  vi.spyOn(crypto, 'verifySecret').mockImplementation(async (...args) => {
    const actual = realVerify(...args) // Real scrypt remains running beneath the ordering barrier.
    if (++calls === 1) { entered.release(); await resume.promise }
    return actual
  })
  return { entered: entered.promise, release: resume.release, calls: () => calls }
}

describe('credential concurrency and revocation', () => {
  it.each(['state-lock-busy', 'state-lock-recovery-required'] as const)('preserves %s without exposing repository details', async code => {
    const error = new VaultStateLockError(code)
    error.message = '/private/path secret lock metadata'
    const service = fixture({ load: async () => { throw error } })
    expect(await service.handle({ action: 'snapshot', clientInstanceId: 'client' })).toEqual({
      ok: false, error: { code, message: 'Vault operation failed' },
    })
  })

  it.each(['state-lock-busy', 'state-lock-recovery-required'] as const)('preserves %s from credential commits', async code => {
    const service = fixture({ commit: async () => { throw new VaultStateLockError(code) } })
    expect(await service.handle(request('recover', recoveryKey))).toEqual({ ok: false, error: { code, message: 'Vault operation failed' } })
    expect((await service.snapshot()).revision).toBe(1)
  })

  it('does not forward arbitrary errors or untrusted code properties', async () => {
    const service = fixture({ load: async () => { throw Object.assign(new Error('secret'), { code: 'state-lock-busy' }) } })
    expect(await service.handle(request('unlock', password))).toEqual({ ok: false, error: { code: 'operation-failed', message: 'Vault operation failed' } })
  })

  it('disposal invalidates running and queued successful unlocks', async () => {
    const service = fixture()
    const gate = holdFirstVerification()
    const active = service.handle(request('unlock', password))
    await gate.entered
    const queued = service.handle(request('unlock', password, 'other'))
    service.dispose()
    gate.release()
    expect(await active).toMatchObject({ ok: false })
    expect(await queued).toMatchObject({ ok: false })
    expect(gate.calls()).toBe(1)
  })

  it('rechecks durable credential changes that happen during real verification', async () => {
    let durable = structuredClone(initial)
    const service = fixture({ load: async () => structuredClone(durable) })
    const gate = holdFirstVerification()
    const active = service.handle(request('unlock', password))
    await gate.entered
    durable = { ...durable, revision: 2, groups: { g: { ...durable.groups.g!, credentialVersion: 2 } } }
    gate.release()
    expect(await active).toMatchObject({ ok: false })
  })

  it('an unlock response held in audit cannot carry a valid grant after lock-all', async () => {
    const entered = barrier()
    const resume = barrier()
    const service = fixture({ appendAudit: async () => { entered.release(); await resume.promise } })
    const active = service.handle(request('unlock', password))
    await entered.promise
    await service.handle({ action: 'lock-all', clientInstanceId: 'client' })
    resume.release()
    const result = await active
    if (result.ok) expect(service.validateGrants('client', [result.value.grant])).toEqual({ valid: false })
    else expect(result.ok).toBe(false)
  })

  it.each<Route>(['change-password', 'change-recovery', 'recover'])('lock-all cancels %s before it can replace credentials', async route => {
    const service = fixture()
    const gate = holdFirstVerification()
    const mutation = service.handle(request(route, route === 'change-password' ? password : recoveryKey))
    await gate.entered
    await service.handle({ action: 'lock-all', clientInstanceId: 'client' })
    gate.release()
    expect(await mutation).toMatchObject({ ok: false })
    expect((await service.snapshot()).revision).toBe(1)
    expect(await service.handle(request('unlock', password))).toMatchObject({ ok: true })
  })

  it.each<Route>(['unlock', 'change-password', 'change-recovery', 'recover'])('shares the group cooldown with concurrent %s and rotating client ids', async route => {
    const service = fixture()
    const gate = holdFirstVerification()
    const first = service.handle(request('unlock', 'wrong secret', 'one'))
    await gate.entered
    const second = service.handle(request(route, 'wrong secret', 'two'))
    const correct = service.handle(request('unlock', password, 'three'))
    gate.release()
    const results = await Promise.all([first, second, correct])
    expect(results).toMatchObject([
      { ok: false, error: { code: 'invalid-credentials' } },
      { ok: false, error: { code: 'cooldown', retryAt: 11000 } },
      { ok: false, error: { code: 'cooldown', retryAt: 11000 } },
    ])
    expect(gate.calls()).toBe(2) // No KDF for the over-limit correct password.
  })

  it.each(['lock-group', 'lock-all'] as const)('%s cancels a correct unlock while scrypt is in flight', async action => {
    const service = fixture()
    const gate = holdFirstVerification()
    const pending = service.handle(request('unlock', password))
    await gate.entered
    expect(await service.handle({ action, clientInstanceId: 'client', groupId: 'g' })).toMatchObject({ ok: true })
    gate.release()
    expect(await pending).toMatchObject({ ok: false })
    expect(await service.handle(request('unlock', password))).toMatchObject({ ok: true })
  })

  it.each(['lock-group', 'lock-all'] as const)('%s cancels queued unlocks without cancelling another client', async action => {
    const service = fixture()
    const gate = holdFirstVerification()
    const active = service.handle(request('unlock', password, 'other'))
    await gate.entered
    const queued = service.handle(request('unlock', password))
    await service.handle({ action, clientInstanceId: 'client', groupId: 'g' })
    gate.release()
    expect(await active).toMatchObject({ ok: true })
    expect(await queued).toMatchObject({ ok: false })
    expect(gate.calls()).toBe(1)
  })

  it('captures lock-all revocation before the first repository wait', async () => {
    const entered = barrier()
    const resume = barrier()
    let first = true
    const service = fixture({ load: async () => {
      if (first) { first = false; entered.release(); await resume.promise }
      return structuredClone(initial)
    } })
    const pending = service.handle(request('unlock', password))
    await entered.promise
    await service.handle({ action: 'lock-all', clientInstanceId: 'client' })
    resume.release()
    expect(await pending).toMatchObject({ ok: false })
  })

  it.each<Route>(['change-password', 'change-recovery', 'recover'])('does not let a queued old password succeed after %s', async route => {
    const service = fixture()
    const gate = holdFirstVerification()
    const mutation = service.handle(request(route, route === 'change-password' ? password : recoveryKey))
    await gate.entered
    const pending = service.handle(request('unlock', password, 'other'))
    gate.release()
    expect(await mutation).toMatchObject({ ok: true })
    expect(await pending).toMatchObject({ ok: false })
    expect(await service.handle(request('unlock', 'new password'))).toMatchObject({ ok: true })
  })

  it('bounds admission even with failed-attempt protection disabled', async () => {
    const service = fixture({}, { ...policy, failedAttemptProtection: { ...policy.failedAttemptProtection, enabled: false } })
    const gate = holdFirstVerification()
    const first = service.handle(request('unlock', password))
    await gate.entered
    const batch = Array.from({ length: 20 }, (_, i) => service.handle(request('unlock', password, `client-${i}`)))
    gate.release()
    const results = await Promise.all([first, ...batch])
    expect(results.filter(result => result.ok).length).toBeLessThan(21)
    expect(gate.calls()).toBeLessThanOrEqual(8)
  })
})
