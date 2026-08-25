import { randomUUID } from 'node:crypto'
import type { VaultPolicy } from '../config.js'
import { type BindingMutation, type ChangePasswordInput, type CreateGroupInput, type GrantProof, type RecoveryKeyResult, type RecoverGroupInput, type UnlockResult, type VaultApiRequest, type VaultApiResult, type VaultSnapshot } from '../shared/contracts.js'
import { createVerifier, generateRecoveryKey, verifySecret } from './crypto/verifier.js'
import { FailedAttemptStore } from './auth/attempts.js'
import { InMemoryGrantStore, type GrantStore } from './auth/grants.js'
import { applyBindingMutation } from './bindings/mutations.js'
import type { PasswordGroup, VaultState } from './state/model.js'
import type { AuditEvent } from './state/model.js'
import { VaultStateRepository } from './state/repository.js'

export interface VaultRepository {
  load(): Promise<VaultState>
  commit(expectedRevision: number, next: VaultState): Promise<{ ok: true; revision: number } | { ok: false; code: 'revision-conflict' }>
  appendAudit(event: Parameters<VaultStateRepository['appendAudit']>[0]): Promise<void>
}

export interface VaultServiceDependencies {
  readonly repository: VaultRepository
  readonly policy: VaultPolicy
  readonly grants?: GrantStore
  readonly attempts?: FailedAttemptStore
  readonly now?: () => string
  readonly wallNow?: () => number
}

type ServiceResult = VaultApiResult<any>
const SAFE_ERROR: ServiceResult = { ok: false, error: { code: 'operation-failed', message: 'Vault operation failed' } }

function failed(code: string, retryAt?: number): ServiceResult {
  const message = code === 'cooldown' ? 'Too many attempts' : code === 'invalid-credentials' ? 'Invalid credentials' : code === 'revision-conflict' ? 'Vault revision changed' : 'Vault operation failed'
  return { ok: false, error: { code, message, ...(retryAt === undefined ? {} : { retryAt }) } }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

export class VaultService {
  readonly repository: VaultRepository
  readonly policy: VaultPolicy
  readonly grants: GrantStore
  readonly attempts: FailedAttemptStore
  readonly #now: () => string
  readonly #wallNow: () => number
  #state: VaultState | undefined
  readonly #lastTouch = new Map<string, number>()

  constructor(dependencies: VaultServiceDependencies) {
    this.repository = dependencies.repository
    this.policy = dependencies.policy
    this.grants = dependencies.grants ?? new InMemoryGrantStore()
    this.attempts = dependencies.attempts ?? new FailedAttemptStore()
    this.#now = dependencies.now ?? (() => new Date().toISOString())
    this.#wallNow = dependencies.wallNow ?? (() => Date.now())
  }

  async snapshot(): Promise<VaultSnapshot> { return this.redacted(await this.state()) }

  async handle(request: VaultApiRequest): Promise<ServiceResult> {
    try {
      switch (request.action) {
        case 'snapshot': return { ok: true, value: await this.snapshot() }
        case 'unlock': return await this.unlock(request.clientInstanceId, request.groupId, request.password)
        case 'grants-validate': return { ok: true, value: this.validateGrants(request.clientInstanceId, request.grants) }
        case 'activity-touch': return { ok: true, value: this.touchActivity(request.clientInstanceId, request.grants) }
        case 'lock-group': return this.lockGroup(request.clientInstanceId, request.groupId)
        case 'lock-all': return this.lockAll(request.clientInstanceId)
        case 'group-create': return await this.createGroup(request.expectedRevision, request.input)
        case 'group-change-password': return await this.changePassword(request.expectedRevision, request.input)
        case 'group-recover': return await this.recoverGroup(request.expectedRevision, request.input)
        case 'bindings-update': return await this.updateBindings(request.expectedRevision, request.input)
      }
    } catch {
      return SAFE_ERROR
    }
  }

  validateGrants(clientInstanceId: string, proofs: readonly GrantProof[]): { readonly valid: boolean } {
    const state = this.#state
    if (!state || proofs.length === 0) return { valid: false }
    return { valid: proofs.every((proof) => {
      const group = state.groups[proof.groupId]
      return group !== undefined && this.grants.authorize(proof.token, group.id, group.credentialVersion, clientInstanceId)
    }) }
  }

  touchActivity(clientInstanceId: string, proofs: readonly GrantProof[]): { readonly valid: boolean; readonly touched: boolean } {
    const validated = this.validateGrants(clientInstanceId, proofs)
    if (!validated.valid) return { valid: false, touched: false }
    const now = this.#wallNow()
    const last = this.#lastTouch.get(clientInstanceId)
    if (last !== undefined && Number.isFinite(now) && now - last < 60_000) return { valid: true, touched: false }
    const state = this.#state
    if (!state) return { valid: false, touched: false }
    const touched = proofs.every((proof) => {
      const group = state.groups[proof.groupId]
      return group !== undefined && this.grants.touch(proof.token, group.id, group.credentialVersion, clientInstanceId, this.ttlMs()).authorized
    })
    if (touched) this.#lastTouch.set(clientInstanceId, now)
    return { valid: touched, touched }
  }

  lockGroup(clientInstanceId: string, groupId: string): ServiceResult {
    this.grants.revokeGroup(groupId)
    this.attempts.resetClient(clientInstanceId)
    return { ok: true, value: null }
  }

  lockAll(clientInstanceId: string): ServiceResult {
    this.grants.revokeClient(clientInstanceId)
    this.attempts.resetClient(clientInstanceId)
    this.#lastTouch.delete(clientInstanceId)
    return { ok: true, value: null }
  }

  dispose(): void {
    this.grants.clear()
    this.attempts.clear()
    this.#lastTouch.clear()
    this.#state = undefined
  }

  private async unlock(clientInstanceId: string, groupId: string, password: string): Promise<ServiceResult> {
    const state = await this.state()
    const group = state.groups[groupId]
    if (!group) return failed('invalid-credentials')
    const availability = this.attempts.check(groupId, clientInstanceId, this.policy.failedAttemptProtection)
    if (availability.kind === 'cooldown') return failed('cooldown', availability.retryAt)
    let valid = false
    try { valid = await verifySecret(password, group.password) } catch { valid = false }
    if (!valid) {
      const decision = this.attempts.recordFailure(groupId, clientInstanceId, this.policy.failedAttemptProtection)
      return decision.kind === 'cooldown' ? failed('cooldown', decision.retryAt) : failed('invalid-credentials')
    }
    this.attempts.recordSuccess(groupId, clientInstanceId)
    try {
      const grant = this.grants.issue(group.id, group.credentialVersion, clientInstanceId, this.ttlMs())
      const result: UnlockResult = { grant: { groupId: grant.groupId, credentialVersion: grant.credentialVersion, token: grant.token }, expiresAt: grant.expiresAt }
      return { ok: true, value: result }
    } catch { return SAFE_ERROR }
  }

  private async createGroup(expectedRevision: number, input: CreateGroupInput): Promise<ServiceResult> {
    const state = await this.state()
    if (state.revision !== expectedRevision) return failed('revision-conflict')
    if (Object.values(state.groups).some((group) => group.name === input.name)) return failed('duplicate-name')
    const now = this.#now()
    const id = 'group-' + randomUUID()
    const recoveryKey = generateRecoveryKey()
    const group: PasswordGroup = { id, name: input.name, password: await createVerifier(input.password), recovery: { ...(await createVerifier(recoveryKey)), generatedAt: now }, credentialVersion: 1, createdAt: now, updatedAt: now }
    let next: VaultState = { ...state, revision: expectedRevision, groups: { ...state.groups, [id]: group }, bindings: state.bindings }
    for (const candidate of input.bindings) {
      const binding = candidate.mode === 'direct'
        ? { ...candidate, passwordGroupId: candidate.passwordGroupId ?? id }
        : candidate
      if (binding.mode === 'direct' && binding.passwordGroupId !== id) return failed('invalid-binding')
      next = applyBindingMutation(next, { kind: 'replace', binding }, () => now)
    }
    next = { ...next, revision: expectedRevision + 1 }
    const committed = await this.commit(expectedRevision, next)
    if (committed === 'conflict') return failed('revision-conflict')
    if (committed === 'failed') return failed('persistence-failed')
    const value: RecoveryKeyResult = { snapshot: this.redacted(next), recoveryKey }
    return { ok: true, value }
  }

  private async changePassword(expectedRevision: number, input: ChangePasswordInput): Promise<ServiceResult> {
    const state = await this.state()
    const group = state.groups[input.groupId]
    if (!group || !(await this.authorizeCredential(group, input))) return failed('invalid-credentials')
    if (state.revision !== expectedRevision) return failed('revision-conflict')
    const now = this.#now()
    const recoveryKey = input.rotateRecovery ? generateRecoveryKey() : undefined
    const nextGroup: PasswordGroup = { ...group, password: await createVerifier(input.newPassword), recovery: input.rotateRecovery ? { ...(await createVerifier(recoveryKey as string)), generatedAt: now } : group.recovery, credentialVersion: group.credentialVersion + 1, updatedAt: now }
    const next = { ...state, revision: expectedRevision + 1, groups: { ...state.groups, [group.id]: nextGroup } }
    const committed = await this.commit(expectedRevision, next)
    if (committed === 'conflict') return failed('revision-conflict')
    if (committed === 'failed') return failed('persistence-failed')
    this.grants.revokeGroup(group.id)
    this.attempts.resetGroup(group.id)
    await this.audit({ action: 'password-changed', groupId: group.id, credentialVersion: nextGroup.credentialVersion, revision: next.revision, result: 'success' })
    return { ok: true, value: { snapshot: this.redacted(next), ...(recoveryKey === undefined ? {} : { recoveryKey }) } }
  }

  private async recoverGroup(expectedRevision: number, input: RecoverGroupInput): Promise<ServiceResult> {
    const state = await this.state()
    const group = state.groups[input.groupId]
    if (!group || !(await verifySecret(input.recoveryKey, group.recovery))) return failed('invalid-credentials')
    if (state.revision !== expectedRevision) return failed('revision-conflict')
    const now = this.#now()
    const recoveryKey = generateRecoveryKey()
    const nextGroup: PasswordGroup = { ...group, password: await createVerifier(input.newPassword), recovery: { ...(await createVerifier(recoveryKey)), generatedAt: now, lastVerifiedAt: now }, credentialVersion: group.credentialVersion + 1, updatedAt: now }
    const next = { ...state, revision: expectedRevision + 1, groups: { ...state.groups, [group.id]: nextGroup } }
    const committed = await this.commit(expectedRevision, next)
    if (committed === 'conflict') return failed('revision-conflict')
    if (committed === 'failed') return failed('persistence-failed')
    this.grants.revokeGroup(group.id)
    this.attempts.resetGroup(group.id)
    await this.audit({ action: 'group-recovered', groupId: group.id, credentialVersion: nextGroup.credentialVersion, revision: next.revision, result: 'success' })
    const value: RecoveryKeyResult = { snapshot: this.redacted(next), recoveryKey }
    return { ok: true, value }
  }

  private async updateBindings(expectedRevision: number, mutation: BindingMutation): Promise<ServiceResult> {
    const state = await this.state()
    if (state.revision !== expectedRevision) return failed('revision-conflict')
    const next = applyBindingMutation(state, mutation, this.#now)
    const committed = { ...next, revision: expectedRevision + 1 }
    const commitResult = await this.commit(expectedRevision, committed)
    if (commitResult === 'conflict') return failed('revision-conflict')
    if (commitResult === 'failed') return failed('persistence-failed')
    if (mutation.kind === 'delete-group') {
      this.grants.revokeGroup(mutation.groupId)
      this.attempts.resetGroup(mutation.groupId)
      if (mutation.moveToGroupId !== undefined) {
        await this.audit({ action: 'members-migrated', groupId: mutation.groupId, revision: committed.revision, result: 'success', count: state.bindings.filter((binding) => binding.passwordGroupId === mutation.groupId).length })
      }
    }
    return { ok: true, value: this.redacted(committed) }
  }

  private async authorizeCredential(group: PasswordGroup, input: ChangePasswordInput): Promise<boolean> {
    if (input.currentPassword !== undefined) return verifySecret(input.currentPassword, group.password)
    if (input.recoveryKey !== undefined) return verifySecret(input.recoveryKey, group.recovery)
    return false
  }

  private ttlMs(): number { return this.policy.autoLockMinutes === 0 ? 0 : this.policy.autoLockMinutes * 60_000 }

  private async state(): Promise<VaultState> {
    if (!this.#state) this.#state = await this.repository.load()
    return this.#state
  }

  private async commit(expectedRevision: number, next: VaultState): Promise<'ok' | 'conflict' | 'failed'> {
    try {
      const result = await this.repository.commit(expectedRevision, next)
      if (!result.ok) { this.#state = await this.repository.load(); return 'conflict' }
      this.#state = next
      return 'ok'
    } catch { return 'failed' }
  }

  private async audit(fields: Omit<AuditEvent, 'timestamp'>): Promise<void> {
    await this.repository.appendAudit({ timestamp: this.#now(), ...fields })
  }

  private redacted(state: VaultState): VaultSnapshot {
    return deepFreeze({ revision: state.revision, policy: this.policy, groups: Object.values(state.groups).map((group) => ({ id: group.id, name: group.name, credentialVersion: group.credentialVersion, recoveryConfigured: true, recoveryGeneratedAt: group.recovery.generatedAt, ...(group.recovery.lastVerifiedAt === undefined ? {} : { recoveryLastVerifiedAt: group.recovery.lastVerifiedAt }), memberCount: state.bindings.filter((binding) => binding.passwordGroupId === group.id).length })), bindings: [...state.bindings] })
  }
}
