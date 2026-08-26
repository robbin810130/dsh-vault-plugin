import type { VaultClientStore } from '../store-types.js'
import { performanceClock, type ActivityClock } from './clock.js'

export interface ActivityMonitorOptions {
  readonly now?: () => number
  readonly intervalMs?: number
  readonly touchThrottleMs?: number
}

export interface ActivityMonitor {
  start(): void
  stop(): void
}

const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'touchstart', 'scroll', 'focus'] as const

export function createActivityMonitor(store: VaultClientStore, options: ActivityMonitorOptions = {}): ActivityMonitor {
  const clock: ActivityClock = { now: options.now ?? performanceClock.now }
  const intervalMs = options.intervalMs ?? 1_000
  const touchThrottleMs = options.touchThrottleMs ?? 60_000
  let timer: ReturnType<typeof setInterval> | undefined
  let started = false
  let lastTick = 0
  let lastActivity = 0
  let lastTouch = Number.NEGATIVE_INFINITY

  const touch = () => {
    const now = clock.now()
    lastActivity = now
    if (now - lastTouch < touchThrottleMs) return
    lastTouch = now
    void store.touchActivity()
  }

  const tick = () => {
    if (!started) return
    const now = clock.now()
    const drift = now - lastTick
    lastTick = now
    if (drift > intervalMs * 2 && store.getSnapshot().policy.lockOnSystemSleep) {
      void store.lockAll()
      lastActivity = now
      return
    }
    const minutes = store.getSnapshot().policy.autoLockMinutes
    if (minutes !== 0 && now - lastActivity >= minutes * 60_000) {
      void store.lockAll()
      lastActivity = now
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') touch()
  }

  return {
    start() {
      if (started) return
      started = true
      lastTick = clock.now()
      lastActivity = lastTick
      for (const event of ACTIVITY_EVENTS) window.addEventListener(event, touch, { passive: true })
      document.addEventListener('visibilitychange', onVisibilityChange)
      timer = globalThis.setInterval(tick, intervalMs)
    },
    stop() {
      if (!started) return
      started = false
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, touch)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (timer !== undefined) globalThis.clearInterval(timer)
      timer = undefined
    },
  }
}
