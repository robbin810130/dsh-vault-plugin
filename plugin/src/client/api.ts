import type {
  ActivityTouchResult,
  GrantProof,
  GrantValidationResult,
  ProtectionBinding,
  RecoveryKeyResult,
  RedactedPasswordGroup,
  UnlockResult,
  VaultApiRequest,
  VaultApiResult,
  VaultSnapshot,
} from '../shared/contracts.js'

export interface VaultApiClient {
  call<T>(request: VaultApiRequest, signal?: AbortSignal): Promise<VaultApiResult<T>>
}

const ROUTE = '/dsh-vault/api'
const HOST_ERROR_CODES = new Set([
  'body-too-large',
  'cooldown',
  'duplicate-name',
  'invalid-binding',
  'invalid-credentials',
  'invalid-request',
  'method-not-allowed',
  'operation-failed',
  'origin-refused',
  'persistence-failed',
  'revision-conflict',
  'unsupported-media-type',
])

type JsonRecord = Record<string, unknown>

function failure(code: string, message: string, retryAt?: number): VaultApiResult<never> {
  return { ok: false, error: { code, message, ...(retryAt === undefined ? {} : { retryAt }) } }
}

function record(value: unknown): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid Vault response')
  return value as JsonRecord
}

function exact(source: JsonRecord, keys: readonly string[]): void {
  if (Object.keys(source).some(key => !keys.includes(key))) throw new TypeError('Invalid Vault response')
}

function text(value: unknown, max = 512): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new TypeError('Invalid Vault response')
  return value
}

function optionalText(value: unknown, max = 512): string | undefined {
  return value === undefined ? undefined : text(value, max)
}

function safeInteger(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new TypeError('Invalid Vault response')
  return value as number
}

function finiteNumber(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new TypeError('Invalid Vault response')
  return value
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TypeError('Invalid Vault response')
  return value
}

function array(value: unknown, max = 256): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new TypeError('Invalid Vault response')
  return value
}

function parsePolicy(value: unknown): VaultSnapshot['policy'] {
  const source = record(value)
  exact(source, ['autoLockMinutes', 'lockOnSystemSleep', 'lockedNameVisibility', 'failedAttemptProtection'])
  if (source.autoLockMinutes !== 0 && source.autoLockMinutes !== 15 && source.autoLockMinutes !== 30 && source.autoLockMinutes !== 60) {
    throw new TypeError('Invalid Vault response')
  }
  if (source.lockedNameVisibility !== 'workspace-visible-session-hidden'
    && source.lockedNameVisibility !== 'all-visible'
    && source.lockedNameVisibility !== 'all-hidden') {
    throw new TypeError('Invalid Vault response')
  }
  const attempts = record(source.failedAttemptProtection)
  exact(attempts, ['enabled', 'maxAttempts', 'cooldownSeconds'])
  return {
    autoLockMinutes: source.autoLockMinutes,
    lockOnSystemSleep: boolean(source.lockOnSystemSleep),
    lockedNameVisibility: source.lockedNameVisibility,
    failedAttemptProtection: {
      enabled: boolean(attempts.enabled),
      maxAttempts: safeInteger(attempts.maxAttempts, 1),
      cooldownSeconds: safeInteger(attempts.cooldownSeconds, 1),
    },
  }
}

function parseGroup(value: unknown): RedactedPasswordGroup {
  const source = record(value)
  exact(source, [
    'id',
    'name',
    'credentialVersion',
    'recoveryConfigured',
    'recoveryGeneratedAt',
    'recoveryLastVerifiedAt',
    'memberCount',
  ])
  const recoveryLastVerifiedAt = optionalText(source.recoveryLastVerifiedAt, 128)
  return {
    id: text(source.id, 128),
    name: text(source.name, 128),
    credentialVersion: safeInteger(source.credentialVersion, 1),
    recoveryConfigured: boolean(source.recoveryConfigured),
    recoveryGeneratedAt: text(source.recoveryGeneratedAt, 128),
    ...(recoveryLastVerifiedAt === undefined ? {} : { recoveryLastVerifiedAt }),
    memberCount: safeInteger(source.memberCount),
  }
}

function parseBinding(value: unknown): ProtectionBinding {
  const source = record(value)
  exact(source, ['targetType', 'targetId', 'mode', 'passwordGroupId', 'workspaceId', 'createdAt', 'updatedAt'])
  if (source.targetType !== 'workspace' && source.targetType !== 'session') throw new TypeError('Invalid Vault response')
  if (source.mode !== 'direct' && source.mode !== 'inherit' && source.mode !== 'no-inherit') throw new TypeError('Invalid Vault response')
  const passwordGroupId = optionalText(source.passwordGroupId, 128)
  const workspaceId = optionalText(source.workspaceId, 128)
  return {
    targetType: source.targetType,
    targetId: text(source.targetId, 128),
    mode: source.mode,
    ...(passwordGroupId === undefined ? {} : { passwordGroupId }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
    createdAt: text(source.createdAt, 128),
    updatedAt: text(source.updatedAt, 128),
  }
}

function parseSnapshot(value: unknown): VaultSnapshot {
  const source = record(value)
  exact(source, ['revision', 'policy', 'groups', 'bindings'])
  return {
    revision: safeInteger(source.revision),
    policy: parsePolicy(source.policy),
    groups: array(source.groups).map(parseGroup),
    bindings: array(source.bindings).map(parseBinding),
  }
}

function parseGrant(value: unknown): GrantProof {
  const source = record(value)
  exact(source, ['groupId', 'credentialVersion', 'token'])
  const token = text(source.token, 256)
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TypeError('Invalid Vault response')
  return {
    groupId: text(source.groupId, 128),
    credentialVersion: safeInteger(source.credentialVersion, 1),
    token,
  }
}

function parseUnlockResult(value: unknown): UnlockResult {
  const source = record(value)
  exact(source, ['grant', 'expiresAt'])
  return { grant: parseGrant(source.grant), expiresAt: finiteNumber(source.expiresAt) }
}

function parseGrantValidation(value: unknown): GrantValidationResult {
  const source = record(value)
  exact(source, ['valid'])
  return { valid: boolean(source.valid) }
}

function parseActivityTouch(value: unknown): ActivityTouchResult {
  const source = record(value)
  exact(source, ['valid', 'touched'])
  return { valid: boolean(source.valid), touched: boolean(source.touched) }
}

function parseSnapshotWithRecovery(value: unknown, recoveryRequired: boolean): RecoveryKeyResult | { readonly snapshot: VaultSnapshot; readonly recoveryKey?: string } {
  const source = record(value)
  exact(source, ['snapshot', 'recoveryKey'])
  const recoveryKey = optionalText(source.recoveryKey, 512)
  if (recoveryRequired && recoveryKey === undefined) throw new TypeError('Invalid Vault response')
  return { snapshot: parseSnapshot(source.snapshot), ...(recoveryKey === undefined ? {} : { recoveryKey }) }
}

function parseSuccess(request: VaultApiRequest, value: unknown): unknown {
  switch (request.action) {
    case 'snapshot': return parseSnapshot(value)
    case 'unlock': return parseUnlockResult(value)
    case 'grants-validate': return parseGrantValidation(value)
    case 'activity-touch': return parseActivityTouch(value)
    case 'lock-group':
    case 'lock-all':
      if (value !== null) throw new TypeError('Invalid Vault response')
      return null
    case 'group-create': return parseSnapshotWithRecovery(value, true)
    case 'group-change-password': return parseSnapshotWithRecovery(value, false)
    case 'group-recover': return parseSnapshotWithRecovery(value, true)
    case 'bindings-update': return parseSnapshot(value)
  }
}

function parseResult<T>(request: VaultApiRequest, value: unknown): VaultApiResult<T> {
  const source = record(value)
  if (source.ok === true) {
    exact(source, ['ok', 'value'])
    if (!Object.hasOwn(source, 'value')) throw new TypeError('Invalid Vault response')
    return { ok: true, value: parseSuccess(request, source.value) as T }
  }
  if (source.ok === false) {
    exact(source, ['ok', 'error'])
    const error = record(source.error)
    exact(error, ['code', 'message', 'retryAt'])
    const code = text(error.code, 64)
    text(error.message, 512)
    if (!HOST_ERROR_CODES.has(code)) throw new TypeError('Invalid Vault response')
    const retryAt = error.retryAt === undefined ? undefined : finiteNumber(error.retryAt)
    return failure(code, 'Vault operation failed', retryAt)
  }
  throw new TypeError('Invalid Vault response')
}

export function createVaultApiClient(fetcher: typeof fetch = globalThis.fetch): VaultApiClient {
  return {
    async call<T>(request: VaultApiRequest, signal?: AbortSignal): Promise<VaultApiResult<T>> {
      let response: Response
      try {
        response = await fetcher(ROUTE, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          ...(signal === undefined ? {} : { signal }),
        })
      } catch {
        return signal?.aborted
          ? failure('request-aborted', 'Vault request aborted')
          : failure('host-unavailable', 'Vault host unavailable')
      }

      if (!response.ok) return failure('host-unavailable', 'Vault host unavailable')
      let body: unknown
      try {
        body = await response.json() as unknown
      } catch {
        return failure('invalid-response', 'Vault response refused')
      }
      try {
        return parseResult<T>(request, body)
      } catch {
        return failure('invalid-response', 'Vault response refused')
      }
    },
  }
}
