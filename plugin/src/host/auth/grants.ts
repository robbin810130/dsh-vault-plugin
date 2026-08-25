import { createHash, randomBytes as secureRandomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'

export interface UnlockGrant {
  readonly token: string
  readonly groupId: string
  readonly credentialVersion: number
  readonly clientInstanceId: string
  readonly issuedAt: number
  /** Display-only wall-clock timestamp; NO_IDLE_EXPIRY means no idle deadline. */
  readonly expiresAt: number
}

export const NO_IDLE_EXPIRY = 0

export type GrantTouchResult =
  | { readonly authorized: true; /** Display-only; never used for authorization. */ readonly expiresAt: number }
  | { readonly authorized: false }

export interface GrantStore {
  issue(groupId: string, credentialVersion: number, clientInstanceId: string, ttlMs: number): UnlockGrant
  authorize(token: string, groupId: string, credentialVersion: number, clientInstanceId: string): boolean
  touch(
    token: string,
    groupId: string,
    credentialVersion: number,
    clientInstanceId: string,
    ttlMs: number,
  ): GrantTouchResult
  revokeGroup(groupId: string): void
  revokeClient(clientInstanceId: string): void
  clear(): void
}

interface StoredGrant {
  readonly groupId: string
  readonly credentialVersion: number
  readonly clientInstanceId: string
  readonly deadline: number | undefined
}

export interface GrantStoreDependencies {
  readonly monotonicNow: () => number
  readonly wallNow: () => number
  readonly randomBytes: (size: number) => Uint8Array
}

const defaults: GrantStoreDependencies = {
  monotonicNow: () => performance.now(),
  wallNow: () => Date.now(),
  randomBytes: secureRandomBytes,
}

export class InMemoryGrantStore implements GrantStore {
  private readonly dependencies: GrantStoreDependencies
  private readonly grants = new Map<string, StoredGrant>()
  private lastMonotonicNow?: number

  constructor(dependencies: Partial<GrantStoreDependencies> = {}) {
    this.dependencies = { ...defaults, ...dependencies }
  }

  issue(
    groupId: string,
    credentialVersion: number,
    clientInstanceId: string,
    ttlMs: number,
  ): UnlockGrant {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new RangeError('Grant TTL must be a non-negative finite number')
    }

    const monotonicNow = this.readMonotonicNow()
    if (monotonicNow === undefined) throw new RangeError('Grant monotonic clock is invalid')
    const deadline = this.deadlineFrom(monotonicNow, ttlMs)
    if (ttlMs > 0 && deadline === undefined) {
      this.grants.clear()
      throw new RangeError('Grant deadline is invalid')
    }

    const entropy = this.dependencies.randomBytes(32)
    if (entropy.byteLength !== 32) {
      throw new RangeError('Grant token source must return exactly 32 bytes')
    }

    const token = Buffer.from(entropy).toString('base64url')
    const issuedAt = this.dependencies.wallNow()
    this.grants.set(this.digestKey(token), {
      groupId,
      credentialVersion,
      clientInstanceId,
      deadline,
    })

    return {
      token,
      groupId,
      credentialVersion,
      clientInstanceId,
      issuedAt,
      expiresAt: this.displayExpiresAt(issuedAt, ttlMs),
    }
  }

  authorize(
    token: string,
    groupId: string,
    credentialVersion: number,
    clientInstanceId: string,
  ): boolean {
    const monotonicNow = this.readMonotonicNow()
    if (monotonicNow === undefined) return false

    const digest = this.digestKey(token)
    const grant = this.grants.get(digest)
    if (!grant) return false

    if (grant.deadline !== undefined && monotonicNow >= grant.deadline) {
      this.grants.delete(digest)
      return false
    }

    return grant.groupId === groupId
      && grant.credentialVersion === credentialVersion
      && grant.clientInstanceId === clientInstanceId
  }

  touch(
    token: string,
    groupId: string,
    credentialVersion: number,
    clientInstanceId: string,
    ttlMs: number,
  ): GrantTouchResult {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new RangeError('Grant TTL must be a non-negative finite number')
    }

    const monotonicNow = this.readMonotonicNow()
    if (monotonicNow === undefined) return { authorized: false }

    const digest = this.digestKey(token)
    const grant = this.grants.get(digest)
    if (!grant) return { authorized: false }
    if (grant.deadline !== undefined && monotonicNow >= grant.deadline) {
      this.grants.delete(digest)
      return { authorized: false }
    }
    if (grant.groupId !== groupId
      || grant.credentialVersion !== credentialVersion
      || grant.clientInstanceId !== clientInstanceId) {
      return { authorized: false }
    }

    const deadline = this.deadlineFrom(monotonicNow, ttlMs)
    if (ttlMs > 0 && deadline === undefined) {
      this.grants.delete(digest)
      return { authorized: false }
    }

    this.grants.set(digest, { ...grant, deadline })
    const wallNow = this.dependencies.wallNow()
    return {
      authorized: true,
      expiresAt: this.displayExpiresAt(wallNow, ttlMs),
    }
  }

  revokeGroup(groupId: string): void {
    for (const [digest, grant] of this.grants) {
      if (grant.groupId === groupId) this.grants.delete(digest)
    }
  }

  revokeClient(clientInstanceId: string): void {
    for (const [digest, grant] of this.grants) {
      if (grant.clientInstanceId === clientInstanceId) this.grants.delete(digest)
    }
  }

  clear(): void {
    this.grants.clear()
  }

  private digestKey(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex')
  }

  private readMonotonicNow(): number | undefined {
    const now = this.dependencies.monotonicNow()
    if (!Number.isFinite(now) || (this.lastMonotonicNow !== undefined && now < this.lastMonotonicNow)) {
      this.grants.clear()
      return undefined
    }
    this.lastMonotonicNow = now
    return now
  }

  private deadlineFrom(now: number, ttlMs: number): number | undefined {
    if (ttlMs === 0) return undefined
    const deadline = now + ttlMs
    return Number.isFinite(deadline) && deadline > now ? deadline : undefined
  }

  private displayExpiresAt(wallNow: number, ttlMs: number): number {
    return ttlMs === 0 ? NO_IDLE_EXPIRY : wallNow + ttlMs
  }
}
