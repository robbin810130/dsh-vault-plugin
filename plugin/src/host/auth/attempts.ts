import { performance } from 'node:perf_hooks'
import type { VaultPolicy } from '../../config.js'

export type FailedAttemptPolicy = VaultPolicy['failedAttemptProtection']

export type AttemptAvailability =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'cooldown'; readonly retryAt: number }

export type FailedAttemptDecision =
  | { readonly kind: 'rejected'; readonly remainingAttempts?: number }
  | { readonly kind: 'cooldown'; readonly retryAt: number }

interface AttemptState {
  readonly failures: number
  /** null means deadline construction failed and the cooldown remains fail-closed. */
  readonly cooldownDeadline?: number | null
  readonly retryAt?: number
}

export interface FailedAttemptStoreDependencies {
  readonly monotonicNow: () => number
  readonly wallNow: () => number
}

const defaults: FailedAttemptStoreDependencies = {
  monotonicNow: () => performance.now(),
  wallNow: () => Date.now(),
}

export class FailedAttemptStore {
  private readonly dependencies: FailedAttemptStoreDependencies
  // Counters are keyed by group only. clientInstanceId is self-reported by the
  // caller, so keying by it would let any local process reset its allowance by
  // rotating identifiers; group-level counters cannot be bypassed that way.
  private readonly groups = new Map<string, AttemptState>()
  private lastMonotonicNow?: number

  constructor(dependencies: Partial<FailedAttemptStoreDependencies> = {}) {
    this.dependencies = { ...defaults, ...dependencies }
  }

  check(
    groupId: string,
    policy: FailedAttemptPolicy,
  ): AttemptAvailability {
    this.setPolicy(policy)

    const state = this.groups.get(groupId)
    const now = this.readMonotonicNow()
    if (now === undefined) {
      return { kind: 'cooldown', retryAt: state?.retryAt ?? this.failClosedRetryAt() }
    }
    if (state?.cooldownDeadline === undefined || state.retryAt === undefined) {
      return { kind: 'allowed' }
    }
    if (state.cooldownDeadline !== null && now >= state.cooldownDeadline) {
      this.groups.delete(groupId)
      return { kind: 'allowed' }
    }
    return { kind: 'cooldown', retryAt: state.retryAt }
  }

  recordFailure(
    groupId: string,
    policy: FailedAttemptPolicy,
  ): FailedAttemptDecision {
    this.setPolicy(policy)

    const current = this.groups.get(groupId)
    if (!policy.enabled) {
      if (current?.cooldownDeadline === undefined || current.retryAt === undefined) {
        return { kind: 'rejected' }
      }
      const now = this.readMonotonicNow()
      if (now === undefined || current.cooldownDeadline === null || now < current.cooldownDeadline) {
        return { kind: 'cooldown', retryAt: current.retryAt }
      }
      this.groups.delete(groupId)
      return { kind: 'rejected' }
    }

    const now = this.readMonotonicNow()
    if (now === undefined) {
      if (current?.cooldownDeadline !== undefined && current.retryAt !== undefined) {
        return { kind: 'cooldown', retryAt: current.retryAt }
      }
      return { kind: 'rejected' }
    }
    if (current?.cooldownDeadline !== undefined && current.retryAt !== undefined) {
      if (current.cooldownDeadline === null || now < current.cooldownDeadline) {
        return { kind: 'cooldown', retryAt: current.retryAt }
      }
      this.groups.delete(groupId)
    }

    const failures = (current?.cooldownDeadline === undefined ? current?.failures : undefined) ?? 0
    const nextFailures = failures + 1
    if (nextFailures >= policy.maxAttempts) {
      const cooldownMs = policy.cooldownSeconds * 1_000
      const cooldownDeadline = this.deadlineFrom(now, cooldownMs)
      const wallNow = this.dependencies.wallNow()
      const retryAtCandidate = wallNow + cooldownMs
      const retryAt = Number.isFinite(retryAtCandidate)
        ? retryAtCandidate
        : (Number.isFinite(wallNow) ? wallNow : 0)
      this.groups.set(groupId, {
        failures: nextFailures,
        cooldownDeadline,
        retryAt,
      })
      return { kind: 'cooldown', retryAt }
    }

    this.groups.set(groupId, { failures: nextFailures })
    return {
      kind: 'rejected',
      remainingAttempts: policy.maxAttempts - nextFailures,
    }
  }

  setPolicy(policy: FailedAttemptPolicy): void {
    if (policy.enabled) return

    for (const [groupId, state] of this.groups) {
      if (state.cooldownDeadline === undefined || state.retryAt === undefined) {
        this.groups.delete(groupId)
      }
    }
  }

  recordSuccess(groupId: string): void {
    this.groups.delete(groupId)
  }

  resetGroup(groupId: string): void {
    this.groups.delete(groupId)
  }

  clear(): void {
    this.groups.clear()
  }

  private readMonotonicNow(): number | undefined {
    const now = this.dependencies.monotonicNow()
    if (!Number.isFinite(now) || (this.lastMonotonicNow !== undefined && now < this.lastMonotonicNow)) {
      return undefined
    }
    this.lastMonotonicNow = now
    return now
  }

  private failClosedRetryAt(): number {
    const retryAt = this.dependencies.wallNow()
    return Number.isFinite(retryAt) ? retryAt : 0
  }

  private deadlineFrom(now: number, cooldownMs: number): number | null {
    const deadline = now + cooldownMs
    return Number.isFinite(cooldownMs)
      && cooldownMs > 0
      && Number.isFinite(deadline)
      && deadline > now
      ? deadline
      : null
  }
}
