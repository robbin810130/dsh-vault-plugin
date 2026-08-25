import { createHash, randomBytes as secureRandomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'

export interface UnlockGrant {
  readonly token: string
  readonly groupId: string
  readonly credentialVersion: number
  readonly clientInstanceId: string
  readonly issuedAt: number
  readonly expiresAt: number
}

export interface GrantStore {
  issue(groupId: string, credentialVersion: number, clientInstanceId: string, ttlMs: number): UnlockGrant
  authorize(token: string, groupId: string, credentialVersion: number, clientInstanceId: string): boolean
  revokeGroup(groupId: string): void
  revokeClient(clientInstanceId: string): void
  clear(): void
}

interface StoredGrant {
  readonly groupId: string
  readonly credentialVersion: number
  readonly clientInstanceId: string
  readonly deadline: number
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

  constructor(dependencies: Partial<GrantStoreDependencies> = {}) {
    this.dependencies = { ...defaults, ...dependencies }
  }

  issue(
    groupId: string,
    credentialVersion: number,
    clientInstanceId: string,
    ttlMs: number,
  ): UnlockGrant {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('Grant TTL must be a positive finite number')
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
      deadline: this.dependencies.monotonicNow() + ttlMs,
    })

    return {
      token,
      groupId,
      credentialVersion,
      clientInstanceId,
      issuedAt,
      expiresAt: issuedAt + ttlMs,
    }
  }

  authorize(
    token: string,
    groupId: string,
    credentialVersion: number,
    clientInstanceId: string,
  ): boolean {
    const digest = this.digestKey(token)
    const grant = this.grants.get(digest)
    if (!grant) return false

    if (this.dependencies.monotonicNow() >= grant.deadline) {
      this.grants.delete(digest)
      return false
    }

    return grant.groupId === groupId
      && grant.credentialVersion === credentialVersion
      && grant.clientInstanceId === clientInstanceId
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
}
