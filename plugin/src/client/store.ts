import type {
  ActivityTouchResult,
  BindingMutation,
  ChangePasswordInput,
  CreateGroupInput,
  GrantProof,
  GrantValidationResult,
  RecoverGroupInput,
  RecoveryKeyResult,
  UnlockResult,
  VaultApiRequest,
  VaultApiResult,
  VaultSnapshot,
} from '../shared/contracts.js'
import { createVaultApiClient, type VaultApiClient } from './api.js'
import type { ChangePasswordResult, UnlockPromptState, VaultClientSnapshot, VaultClientStore } from './store-types.js'

export type { ChangePasswordResult, UnlockPromptState, VaultClientSnapshot, VaultClientStore } from './store-types.js'

const SAFE_ERROR_CODES = new Set([
  'body-too-large',
  'cooldown',
  'duplicate-name',
  'host-unavailable',
  'invalid-binding',
  'invalid-credentials',
  'invalid-request',
  'invalid-response',
  'method-not-allowed',
  'operation-failed',
  'origin-refused',
  'persistence-failed',
  'request-aborted',
  'revision-conflict',
  'unsupported-media-type',
])

function failed(code: string, message: string, retryAt?: number): VaultApiResult<never> {
  return { ok: false, error: { code, message, ...(retryAt === undefined ? {} : { retryAt }) } }
}

function safeFailure(value: unknown): VaultApiResult<never> {
  if (value !== null && typeof value === 'object') {
    const source = value as { readonly code?: unknown; readonly retryAt?: unknown }
    if (typeof source.code === 'string' && SAFE_ERROR_CODES.has(source.code)) {
      const retryAt = typeof source.retryAt === 'number' && Number.isFinite(source.retryAt) && source.retryAt >= 0
        ? source.retryAt
        : undefined
      const message = source.code === 'host-unavailable'
        ? 'Vault host unavailable'
        : source.code === 'invalid-response'
          ? 'Vault response refused'
          : source.code === 'request-aborted'
            ? 'Vault request aborted'
            : 'Vault operation failed'
      return failed(source.code, message, retryAt)
    }
  }
  return failed('invalid-response', 'Vault response refused')
}

function isUnavailable(result: VaultApiResult<unknown>): boolean {
  return !result.ok && (result.error.code === 'host-unavailable'
    || result.error.code === 'invalid-response'
    || result.error.code === 'request-aborted')
}

class ImmutableStringSet implements ReadonlySet<string> {
  readonly #values: Set<string>

  constructor(values: Iterable<string>) {
    this.#values = new Set(values)
    Object.freeze(this)
  }

  get size(): number { return this.#values.size }
  has(value: string): boolean { return this.#values.has(value) }
  entries(): SetIterator<[string, string]> { return this.#values.entries() }
  keys(): SetIterator<string> { return this.#values.keys() }
  values(): SetIterator<string> { return this.#values.values() }
  [Symbol.iterator](): SetIterator<string> { return this.#values[Symbol.iterator]() }
  get [Symbol.toStringTag](): string { return 'ReadonlySet' }

  forEach(callback: (value: string, value2: string, set: ReadonlySet<string>) => void, thisArg?: unknown): void {
    for (const value of this.#values) callback.call(thisArg, value, value, this)
  }
}

function immutableSnapshot(
  host: VaultClientSnapshot['host'],
  revision: number,
  groups: VaultSnapshot['groups'],
  bindings: VaultSnapshot['bindings'],
  unlockedGroupIds: Iterable<string>,
  prompt: UnlockPromptState | null = null,
): VaultClientSnapshot {
  const frozenGroups = Object.freeze(groups.map(group => Object.freeze({ ...group })))
  const frozenBindings = Object.freeze(bindings.map(binding => Object.freeze({ ...binding })))
  const frozenPrompt = prompt === null
    ? null
    : Object.freeze({ ...prompt, target: Object.freeze({ ...prompt.target }) })
  return Object.freeze({
    host,
    revision,
    groups: frozenGroups,
    bindings: frozenBindings,
    unlockedGroupIds: new ImmutableStringSet(unlockedGroupIds),
    prompt: frozenPrompt,
  })
}

function sameProof(left: GrantProof | undefined, right: GrantProof): boolean {
  return left?.groupId === right.groupId
    && left.credentialVersion === right.credentialVersion
    && left.token === right.token
}

class VaultClientStoreImplementation implements VaultClientStore {
  readonly #clientInstanceId: string
  readonly #api: VaultApiClient
  readonly #grants = new Map<string, GrantProof>()
  readonly #listeners = new Set<() => void>()
  #refreshGeneration = 0
  #snapshot = immutableSnapshot('loading', 0, [], [], [])

  constructor(api: VaultApiClient) {
    const randomUUID = globalThis.crypto?.randomUUID
    if (typeof randomUUID !== 'function') throw new TypeError('Secure UUID generation is unavailable')
    this.#clientInstanceId = randomUUID.call(globalThis.crypto)
    this.#api = api
  }

  get clientInstanceId(): string {
    return this.#clientInstanceId
  }

  getSnapshot(): VaultClientSnapshot {
    return this.#snapshot
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.#listeners.delete(listener)
    }
  }

  async refresh(signal?: AbortSignal): Promise<VaultApiResult<VaultClientSnapshot>> {
    const generation = ++this.#refreshGeneration
    const response = await this.#call<VaultSnapshot>({
      action: 'snapshot',
      clientInstanceId: this.clientInstanceId,
    }, signal)
    if (!this.#isCurrentRefresh(generation)) {
      return response.ok ? { ok: true, value: this.#snapshot } : response
    }
    if (!response.ok) {
      this.#markOffline()
      return response
    }
    if (!this.#acceptSnapshot(response.value, [])) return this.#invalidResponse()

    const validation = await this.#validateGrants(signal, generation)
    if (!validation.ok) return validation
    return { ok: true, value: this.#snapshot }
  }

  async validateGrants(signal?: AbortSignal): Promise<VaultApiResult<GrantValidationResult>> {
    return this.#validateGrants(signal)
  }

  async #validateGrants(signal?: AbortSignal, generation?: number): Promise<VaultApiResult<GrantValidationResult>> {
    if (!this.#isCurrentRefresh(generation)) return { ok: true, value: { valid: true } }
    const candidates = [...this.#grants.entries()]
    if (candidates.length === 0) {
      this.#publish(this.#snapshot.host, [])
      return { ok: true, value: { valid: true } }
    }

    const groups = new Map(this.#snapshot.groups.map(group => [group.id, group] as const))
    const validGroupIds: string[] = []
    let allValid = true
    for (const [groupId, proof] of candidates) {
      if (!this.#isCurrentRefresh(generation)) return { ok: true, value: { valid: allValid } }
      const group = groups.get(groupId)
      if (group === undefined || group.credentialVersion !== proof.credentialVersion) {
        if (sameProof(this.#grants.get(groupId), proof)) this.#grants.delete(groupId)
        allValid = false
        continue
      }

      const response = await this.#call<GrantValidationResult>({
        action: 'grants-validate',
        clientInstanceId: this.clientInstanceId,
        grants: [proof],
      }, signal)
      if (!this.#isCurrentRefresh(generation)) return response
      if (!response.ok) {
        this.#markOffline()
        return response
      }
      if (!response.value.valid) {
        if (sameProof(this.#grants.get(groupId), proof)) this.#grants.delete(groupId)
        allValid = false
        continue
      }
      if (sameProof(this.#grants.get(groupId), proof)) validGroupIds.push(groupId)
    }

    if (!this.#isCurrentRefresh(generation)) return { ok: true, value: { valid: allValid } }
    this.#publish('ready', validGroupIds)
    return { ok: true, value: { valid: allValid } }
  }

  async touchActivity(signal?: AbortSignal): Promise<VaultApiResult<ActivityTouchResult>> {
    const proofs = this.#proofs()
    if (proofs.length === 0) return { ok: true, value: { valid: true, touched: false } }
    const response = await this.#call<ActivityTouchResult>({
      action: 'activity-touch',
      clientInstanceId: this.clientInstanceId,
      grants: proofs,
    }, signal)
    if (!response.ok) {
      if (isUnavailable(response)) this.#markOffline()
      return response
    }
    if (!response.value.valid) this.#grants.clear()
    this.#publish('ready', response.value.valid ? this.#validLocalGroupIds() : [])
    return response
  }

  async unlock(groupId: string, password: string, signal?: AbortSignal): Promise<VaultApiResult<UnlockResult>> {
    const response = await this.#call<UnlockResult>({
      action: 'unlock',
      clientInstanceId: this.clientInstanceId,
      groupId,
      password,
    }, signal)
    if (!response.ok) {
      if (isUnavailable(response)) this.#markOffline()
      return response
    }

    const group = this.#snapshot.groups.find(candidate => candidate.id === groupId)
    const proof = response.value.grant
    if (group === undefined || proof.groupId !== groupId || proof.credentialVersion !== group.credentialVersion) {
      return this.#invalidResponse()
    }
    this.#grants.set(groupId, Object.freeze({ ...proof }))
    this.#publish('ready', this.#validLocalGroupIds())
    return response
  }

  async lockGroup(groupId: string, signal?: AbortSignal): Promise<VaultApiResult<null>> {
    this.#grants.delete(groupId)
    this.#publish(this.#snapshot.host, this.#validLocalGroupIds())
    const response = await this.#call<null>({
      action: 'lock-group',
      clientInstanceId: this.clientInstanceId,
      groupId,
    }, signal)
    if (!response.ok && isUnavailable(response)) this.#markOffline()
    return response
  }

  async lockAll(signal?: AbortSignal): Promise<VaultApiResult<null>> {
    this.#grants.clear()
    this.#publish(this.#snapshot.host, [])
    const response = await this.#call<null>({
      action: 'lock-all',
      clientInstanceId: this.clientInstanceId,
    }, signal)
    if (!response.ok && isUnavailable(response)) this.#markOffline()
    return response
  }

  async createGroup(input: CreateGroupInput, signal?: AbortSignal): Promise<VaultApiResult<RecoveryKeyResult>> {
    const response = await this.#call<RecoveryKeyResult>({
      action: 'group-create',
      clientInstanceId: this.clientInstanceId,
      expectedRevision: this.#snapshot.revision,
      grants: this.#proofs(),
      input,
    }, signal)
    if (!response.ok) {
      if (isUnavailable(response)) this.#markOffline()
      return response
    }
    this.#grants.clear()
    if (!this.#acceptSnapshot(response.value.snapshot, [])) return this.#invalidResponse()
    return response
  }

  async changePassword(input: ChangePasswordInput, signal?: AbortSignal): Promise<VaultApiResult<ChangePasswordResult>> {
    const response = await this.#call<ChangePasswordResult>({
      action: 'group-change-password',
      clientInstanceId: this.clientInstanceId,
      expectedRevision: this.#snapshot.revision,
      input,
    }, signal)
    if (!response.ok) {
      if (isUnavailable(response)) this.#markOffline()
      return response
    }
    this.#grants.delete(input.groupId)
    if (!this.#acceptSnapshot(response.value.snapshot, this.#validLocalGroupIds(response.value.snapshot))) {
      return this.#invalidResponse()
    }
    return response
  }

  async recoverGroup(input: RecoverGroupInput, signal?: AbortSignal): Promise<VaultApiResult<RecoveryKeyResult>> {
    const response = await this.#call<RecoveryKeyResult>({
      action: 'group-recover',
      clientInstanceId: this.clientInstanceId,
      expectedRevision: this.#snapshot.revision,
      input,
    }, signal)
    if (!response.ok) {
      if (isUnavailable(response)) this.#markOffline()
      return response
    }
    this.#grants.delete(input.groupId)
    if (!this.#acceptSnapshot(response.value.snapshot, this.#validLocalGroupIds(response.value.snapshot))) {
      return this.#invalidResponse()
    }
    return response
  }

  async updateBindings(input: BindingMutation, signal?: AbortSignal): Promise<VaultApiResult<VaultSnapshot>> {
    const response = await this.#call<VaultSnapshot>({
      action: 'bindings-update',
      clientInstanceId: this.clientInstanceId,
      expectedRevision: this.#snapshot.revision,
      grants: this.#proofs(),
      input,
    }, signal)
    if (!response.ok) {
      if (isUnavailable(response)) this.#markOffline()
      return response
    }
    this.#grants.clear()
    if (!this.#acceptSnapshot(response.value, [])) return this.#invalidResponse()
    return response
  }

  async #call<T>(request: VaultApiRequest, signal?: AbortSignal): Promise<VaultApiResult<T>> {
    try {
      const result = await this.#api.call<T>(request, signal)
      if (result === null || typeof result !== 'object' || typeof result.ok !== 'boolean') {
        return failed('invalid-response', 'Vault response refused')
      }
      if (!result.ok) return safeFailure(result.error)
      if (!Object.hasOwn(result, 'value')) return failed('invalid-response', 'Vault response refused')
      return result
    } catch {
      return signal?.aborted
        ? failed('request-aborted', 'Vault request aborted')
        : failed('host-unavailable', 'Vault host unavailable')
    }
  }

  #proofs(): readonly GrantProof[] {
    return [...this.#grants.values()].map(proof => ({ ...proof }))
  }

  #isCurrentRefresh(generation: number | undefined): boolean {
    return generation === undefined || generation === this.#refreshGeneration
  }

  #validLocalGroupIds(snapshot: Pick<VaultSnapshot, 'groups'> = this.#snapshot): readonly string[] {
    const groups = new Map(snapshot.groups.map(group => [group.id, group.credentialVersion] as const))
    const valid: string[] = []
    for (const [groupId, proof] of this.#grants) {
      if (groups.get(groupId) === proof.credentialVersion) valid.push(groupId)
      else this.#grants.delete(groupId)
    }
    return valid
  }

  #acceptSnapshot(snapshot: VaultSnapshot, unlockedGroupIds: Iterable<string>): boolean {
    try {
      if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < this.#snapshot.revision) return false
      this.#snapshot = immutableSnapshot('ready', snapshot.revision, snapshot.groups, snapshot.bindings, unlockedGroupIds)
      this.#notify()
      return true
    } catch {
      return false
    }
  }

  #publish(host: VaultClientSnapshot['host'], unlockedGroupIds: Iterable<string>): void {
    this.#snapshot = immutableSnapshot(
      host,
      this.#snapshot.revision,
      this.#snapshot.groups,
      this.#snapshot.bindings,
      unlockedGroupIds,
      this.#snapshot.prompt,
    )
    this.#notify()
  }

  #markOffline(): void {
    this.#publish('offline', [])
  }

  #invalidResponse<T>(): VaultApiResult<T> {
    this.#markOffline()
    return failed('invalid-response', 'Vault response refused')
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) {
      try { listener() } catch { /* A subscriber cannot break Vault state transitions. */ }
    }
  }
}

export function createVaultClientStore(api: VaultApiClient = createVaultApiClient()): VaultClientStore {
  return new VaultClientStoreImplementation(api)
}
