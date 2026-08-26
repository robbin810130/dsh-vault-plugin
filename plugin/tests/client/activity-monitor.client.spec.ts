/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActivityMonitor } from '../../src/client/activity/monitor.js'
import type { VaultClientStore } from '../../src/client/store.js'

function store(policyOverrides: Partial<VaultClientStore['getSnapshot'] extends () => infer S ? S['policy'] : never> = {}): VaultClientStore {
  const snapshot = {
    host: 'ready' as const, revision: 1, groups: [], bindings: [], unlockedGroupIds: new Set<string>(), prompt: null,
    policy: { autoLockMinutes: 15 as const, lockOnSystemSleep: true, lockedNameVisibility: 'all-hidden' as const, failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 }, ...policyOverrides },
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    touchActivity: vi.fn(async () => ({ ok: true, value: { valid: true, touched: true } })),
    lockAll: vi.fn(async () => ({ ok: true, value: null })),
  } as unknown as VaultClientStore
}

afterEach(() => vi.useRealTimers())

describe('Vault activity monitor', () => {
  it('touches at most once per 60 seconds for repeated activity', async () => {
    vi.useFakeTimers()
    const current = store()
    const monitor = createActivityMonitor(current, { now: () => vi.getMockedSystemTime()?.getTime() ?? Date.now() })
    monitor.start()
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('keydown'))
    await vi.advanceTimersByTimeAsync(0)
    expect(current.touchActivity).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(59_999)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(59_999)
    expect(current.touchActivity).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(1)
    expect(current.touchActivity).toHaveBeenCalledTimes(2)
    monitor.stop()
  })

  it('locks all when the scheduled tick detects sleep drift', async () => {
    vi.useFakeTimers()
    let now = 0
    const current = store()
    const monitor = createActivityMonitor(current, { now: () => now, intervalMs: 1_000 })
    monitor.start()
    now = 120_000
    await vi.advanceTimersByTimeAsync(1_000)
    expect(current.lockAll).toHaveBeenCalledOnce()
    monitor.stop()
  })

  it('removes listeners and timer on stop', () => {
    vi.useFakeTimers()
    const current = store({ autoLockMinutes: 0 })
    const monitor = createActivityMonitor(current)
    monitor.start()
    monitor.stop()
    window.dispatchEvent(new Event('pointerdown'))
    expect(current.touchActivity).not.toHaveBeenCalled()
  })
})
