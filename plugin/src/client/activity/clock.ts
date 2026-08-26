export interface ActivityClock {
  now(): number
}

export const performanceClock: ActivityClock = {
  now: () => globalThis.performance?.now() ?? Date.now(),
}
