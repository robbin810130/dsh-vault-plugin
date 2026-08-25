import { describe, expect, it } from 'vitest'
import type { VaultPolicy } from '../../src/config.js'
import { FailedAttemptStore } from '../../src/host/auth/attempts.js'

type AttemptPolicy = VaultPolicy['failedAttemptProtection']

const disabled: AttemptPolicy = { enabled: false, maxAttempts: 3, cooldownSeconds: 300 }

function enabled(maxAttempts: number, cooldownSeconds: number): AttemptPolicy {
  return { enabled: true, maxAttempts, cooldownSeconds }
}

describe('FailedAttemptStore', () => {
  it('globally clears counters when disabled while preserving existing cooldowns', () => {
    let monotonicNow = 1_000
    const store = new FailedAttemptStore({
      monotonicNow: () => monotonicNow,
      wallNow: () => 50_000,
    })
    const policy = enabled(2, 10)

    expect(store.recordFailure('group-a', 'client-a', policy).kind).toBe('rejected')
    expect(store.recordFailure('group-b', 'client-b', policy).kind).toBe('rejected')
    expect(store.recordFailure('group-b', 'client-b', policy)).toEqual({
      kind: 'cooldown',
      retryAt: 60_000,
    })
    expect(store.recordFailure('group-c', 'client-c', policy).kind).toBe('rejected')

    store.setPolicy(disabled)

    expect(store.recordFailure('group-c', 'client-c', disabled)).toEqual({ kind: 'rejected' })
    expect(store.check('group-a', 'client-a', disabled)).toEqual({ kind: 'allowed' })
    expect(store.recordFailure('group-b', 'client-b', disabled)).toEqual({
      kind: 'cooldown',
      retryAt: 60_000,
    })

    store.setPolicy(enabled(3, 10))
    expect(store.recordFailure('group-a', 'client-a', enabled(3, 10))).toEqual({
      kind: 'rejected',
      remainingAttempts: 2,
    })
    expect(store.recordFailure('group-c', 'client-c', enabled(3, 10))).toEqual({
      kind: 'rejected',
      remainingAttempts: 2,
    })
    expect(store.check('group-b', 'client-b', enabled(3, 10))).toEqual({
      kind: 'cooldown',
      retryAt: 60_000,
    })

    monotonicNow = 11_000
    expect(store.check('group-b', 'client-b', disabled)).toEqual({ kind: 'allowed' })
    expect(store.recordFailure('group-b', 'client-b', disabled)).toEqual({ kind: 'rejected' })

    store.setPolicy(enabled(3, 10))
    expect(store.recordFailure('group-b', 'client-b', enabled(3, 10))).toEqual({
      kind: 'rejected',
      remainingAttempts: 2,
    })
  })

  it('applies disabled transitions globally on first policy observation regardless of access order', () => {
    const store = new FailedAttemptStore()
    const policy = enabled(3, 60)

    store.recordFailure('group-a', 'client-a', policy)
    store.recordFailure('group-b', 'client-b', policy)

    expect(store.recordFailure('group-b', 'client-b', disabled)).toEqual({ kind: 'rejected' })
    expect(store.recordFailure('group-a', 'client-a', enabled(3, 60))).toEqual({
      kind: 'rejected',
      remainingAttempts: 2,
    })
  })

  it('uses configurable thresholds and monotonic cooldown expiry', () => {
    let monotonicNow = 1_000
    let wallNow = 50_000
    const store = new FailedAttemptStore({
      monotonicNow: () => monotonicNow,
      wallNow: () => wallNow,
    })
    const policy = enabled(2, 10)

    expect(store.recordFailure('group-a', 'client-a', policy)).toEqual({
      kind: 'rejected',
      remainingAttempts: 1,
    })
    expect(store.recordFailure('group-a', 'client-a', policy)).toEqual({
      kind: 'cooldown',
      retryAt: 60_000,
    })

    wallNow = 5_000_000
    monotonicNow = 10_999
    expect(store.check('group-a', 'client-a', policy)).toEqual({
      kind: 'cooldown',
      retryAt: 60_000,
    })

    wallNow = 0
    monotonicNow = 11_000
    expect(store.check('group-a', 'client-a', policy)).toEqual({ kind: 'allowed' })
    expect(store.recordFailure('group-a', 'client-a', policy)).toEqual({
      kind: 'rejected',
      remainingAttempts: 1,
    })
  })

  it('resets failures after a successful verification', () => {
    const store = new FailedAttemptStore()
    const policy = enabled(3, 60)

    expect(store.recordFailure('group-a', 'client-a', policy)).toEqual({
      kind: 'rejected',
      remainingAttempts: 2,
    })
    store.recordSuccess('group-a', 'client-a')
    expect(store.recordFailure('group-a', 'client-a', policy)).toEqual({
      kind: 'rejected',
      remainingAttempts: 2,
    })
  })

  it('isolates counters and cooldowns by group and client', () => {
    const store = new FailedAttemptStore()
    const policy = enabled(2, 60)

    expect(store.recordFailure('group-a', 'client-a', policy).kind).toBe('rejected')
    expect(store.recordFailure('group-a', 'client-a', policy).kind).toBe('cooldown')

    expect(store.check('group-a', 'client-b', policy)).toEqual({ kind: 'allowed' })
    expect(store.check('group-b', 'client-a', policy)).toEqual({ kind: 'allowed' })
    expect(store.recordFailure('group-a', 'client-b', policy)).toEqual({
      kind: 'rejected',
      remainingAttempts: 1,
    })
    expect(store.recordFailure('group-b', 'client-a', policy)).toEqual({
      kind: 'rejected',
      remainingAttempts: 1,
    })
  })

  it('supports group/client resets, clear, and Host restart semantics', () => {
    const policy = enabled(1, 60)
    const beforeRestart = new FailedAttemptStore()

    beforeRestart.recordFailure('group-a', 'client-a', policy)
    beforeRestart.recordFailure('group-a', 'client-b', policy)
    beforeRestart.recordFailure('group-b', 'client-a', policy)

    beforeRestart.resetGroup('group-a')
    expect(beforeRestart.check('group-a', 'client-a', policy)).toEqual({ kind: 'allowed' })
    expect(beforeRestart.check('group-a', 'client-b', policy)).toEqual({ kind: 'allowed' })
    expect(beforeRestart.check('group-b', 'client-a', policy).kind).toBe('cooldown')

    beforeRestart.resetClient('client-a')
    expect(beforeRestart.check('group-b', 'client-a', policy)).toEqual({ kind: 'allowed' })

    beforeRestart.recordFailure('group-b', 'client-b', policy)
    beforeRestart.clear()
    expect(beforeRestart.check('group-b', 'client-b', policy)).toEqual({ kind: 'allowed' })

    const afterRestart = new FailedAttemptStore()
    expect(afterRestart.check('group-b', 'client-b', policy)).toEqual({ kind: 'allowed' })
  })

  it('does not allow a monotonic clock anomaly to bypass a cooldown', () => {
    let monotonicNow = 1_000
    const store = new FailedAttemptStore({
      monotonicNow: () => monotonicNow,
      wallNow: () => 50_000,
    })
    const policy = enabled(1, 10)

    expect(store.recordFailure('group-a', 'client-a', policy)).toEqual({
      kind: 'cooldown',
      retryAt: 60_000,
    })

    monotonicNow = Number.NaN
    expect(store.check('group-a', 'client-a', policy).kind).toBe('cooldown')
    monotonicNow = Number.POSITIVE_INFINITY
    expect(store.recordFailure('group-a', 'client-a', policy).kind).toBe('cooldown')
    monotonicNow = 999
    expect(store.check('group-a', 'client-a', policy).kind).toBe('cooldown')

    monotonicNow = 11_000
    expect(store.check('group-a', 'client-a', policy)).toEqual({ kind: 'allowed' })
  })

  it('fails closed instead of reporting allowed when its monotonic clock is invalid', () => {
    let monotonicNow = Number.NaN
    const store = new FailedAttemptStore({
      monotonicNow: () => monotonicNow,
      wallNow: () => 50_000,
    })

    expect(store.check('group-a', 'client-a', enabled(3, 60))).toEqual({
      kind: 'cooldown',
      retryAt: 50_000,
    })

    monotonicNow = Number.POSITIVE_INFINITY
    expect(store.check('group-b', 'client-b', disabled)).toEqual({
      kind: 'cooldown',
      retryAt: 50_000,
    })
    expect(store.recordFailure('group-b', 'client-b', disabled)).toEqual({ kind: 'rejected' })
  })
})
