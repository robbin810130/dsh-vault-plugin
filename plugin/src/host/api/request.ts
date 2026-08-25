import type {
  BindingMutation,
  ChangePasswordInput,
  CreateGroupInput,
  GrantProof,
  RecoverGroupInput,
  VaultApiRequest,
} from '../../shared/contracts.js'

export const MAX_BODY_BYTES = 256 * 1024
type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid request')
  return value as JsonRecord
}

function exact(source: JsonRecord, keys: readonly string[]): void {
  if (Object.keys(source).some((key) => !keys.includes(key))) throw new TypeError('Invalid request')
}

function text(value: unknown, max: number, optional = false): string | undefined {
  if (value === undefined && optional) return undefined
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new TypeError('Invalid request')
  return value
}

function id(value: unknown): string { return text(value, 128) as string }

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError('Invalid request')
  return value as number
}

function password(value: unknown): string {
  const parsed = text(value, 512) as string
  if (Buffer.byteLength(parsed, 'utf8') > 512 || Array.from(parsed).length < 8) throw new TypeError('Invalid request')
  return parsed
}

function proof(value: unknown): GrantProof {
  const source = record(value)
  exact(source, ['groupId', 'credentialVersion', 'token'])
  const credentialVersion = revision(source.credentialVersion)
  const token = text(source.token, 256) as string
  if (credentialVersion === 0 || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TypeError('Invalid request')
  return { groupId: id(source.groupId), credentialVersion, token }
}

function proofs(value: unknown): readonly GrantProof[] {
  if (!Array.isArray(value) || value.length > 256) throw new TypeError('Invalid request')
  return value.map(proof)
}

function binding(value: unknown): CreateGroupInput['bindings'][number] {
  const source = record(value)
  exact(source, ['targetType', 'targetId', 'mode', 'passwordGroupId', 'workspaceId', 'createdAt', 'updatedAt'])
  if (source.targetType !== 'workspace' && source.targetType !== 'session') throw new TypeError('Invalid request')
  if (source.mode !== 'direct' && source.mode !== 'inherit' && source.mode !== 'no-inherit') throw new TypeError('Invalid request')
  const passwordGroupId = text(source.passwordGroupId, 128, true)
  const workspaceId = text(source.workspaceId, 128, true)
  return {
    targetType: source.targetType,
    targetId: id(source.targetId),
    mode: source.mode,
    ...(passwordGroupId === undefined ? {} : { passwordGroupId }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
    createdAt: text(source.createdAt, 128) as string,
    updatedAt: text(source.updatedAt, 128) as string,
  }
}

function bindings(value: unknown): readonly CreateGroupInput['bindings'][number][] {
  if (!Array.isArray(value) || value.length > 256) throw new TypeError('Invalid request')
  return value.map(binding)
}

function createInput(value: unknown): CreateGroupInput {
  const source = record(value)
  exact(source, ['name', 'password', 'bindings'])
  return { name: text(source.name, 128) as string, password: password(source.password), bindings: bindings(source.bindings) }
}

function changeInput(value: unknown): ChangePasswordInput {
  const source = record(value)
  exact(source, ['groupId', 'currentPassword', 'recoveryKey', 'newPassword', 'rotateRecovery'])
  if (typeof source.rotateRecovery !== 'boolean') throw new TypeError('Invalid request')
  if ((source.currentPassword === undefined) === (source.recoveryKey === undefined)) throw new TypeError('Invalid request')
  return {
    groupId: id(source.groupId),
    ...(source.currentPassword === undefined ? {} : { currentPassword: password(source.currentPassword) }),
    ...(source.recoveryKey === undefined ? {} : { recoveryKey: password(source.recoveryKey) }),
    newPassword: password(source.newPassword),
    rotateRecovery: source.rotateRecovery,
  }
}

function recoverInput(value: unknown): RecoverGroupInput {
  const source = record(value)
  exact(source, ['groupId', 'recoveryKey', 'newPassword'])
  return { groupId: id(source.groupId), recoveryKey: password(source.recoveryKey), newPassword: password(source.newPassword) }
}

function mutation(value: unknown): BindingMutation {
  const source = record(value)
  const kind = text(source.kind, 32)
  if (kind === 'replace') {
    exact(source, ['kind', 'binding'])
    return { kind, binding: binding(source.binding) }
  }
  if (kind === 'remove') {
    exact(source, ['kind', 'targetType', 'targetId'])
    if (source.targetType !== 'workspace' && source.targetType !== 'session') throw new TypeError('Invalid request')
    return { kind, targetType: source.targetType, targetId: id(source.targetId) }
  }
  if (kind === 'delete-group') {
    exact(source, ['kind', 'groupId', 'moveToGroupId', 'removeProtection'])
    const moveToGroupId = text(source.moveToGroupId, 128, true)
    if (source.removeProtection !== undefined && source.removeProtection !== true) throw new TypeError('Invalid request')
    return { kind, groupId: id(source.groupId), ...(moveToGroupId === undefined ? {} : { moveToGroupId }), ...(source.removeProtection === true ? { removeProtection: true as const } : {}) }
  }
  throw new TypeError('Invalid request')
}

export function parseVaultApiRequest(value: unknown): VaultApiRequest {
  const source = record(value)
  const action = text(source.action, 64)
  switch (action) {
    case 'snapshot':
      exact(source, ['action', 'clientInstanceId'])
      return { action, clientInstanceId: id(source.clientInstanceId) }
    case 'unlock':
      exact(source, ['action', 'clientInstanceId', 'groupId', 'password'])
      return { action, clientInstanceId: id(source.clientInstanceId), groupId: id(source.groupId), password: password(source.password) }
    case 'grants-validate':
    case 'activity-touch':
      exact(source, ['action', 'clientInstanceId', 'grants'])
      return { action, clientInstanceId: id(source.clientInstanceId), grants: proofs(source.grants) }
    case 'lock-group':
      exact(source, ['action', 'clientInstanceId', 'groupId'])
      return { action, clientInstanceId: id(source.clientInstanceId), groupId: id(source.groupId) }
    case 'lock-all':
      exact(source, ['action', 'clientInstanceId'])
      return { action, clientInstanceId: id(source.clientInstanceId) }
    case 'group-create':
      exact(source, ['action', 'clientInstanceId', 'expectedRevision', 'grants', 'input'])
      return { action, clientInstanceId: id(source.clientInstanceId), expectedRevision: revision(source.expectedRevision), grants: proofs(source.grants), input: createInput(source.input) }
    case 'group-change-password':
      exact(source, ['action', 'clientInstanceId', 'expectedRevision', 'input'])
      return { action, clientInstanceId: id(source.clientInstanceId), expectedRevision: revision(source.expectedRevision), input: changeInput(source.input) }
    case 'group-recover':
      exact(source, ['action', 'clientInstanceId', 'expectedRevision', 'input'])
      return { action, clientInstanceId: id(source.clientInstanceId), expectedRevision: revision(source.expectedRevision), input: recoverInput(source.input) }
    case 'bindings-update':
      exact(source, ['action', 'clientInstanceId', 'expectedRevision', 'grants', 'input'])
      return { action, clientInstanceId: id(source.clientInstanceId), expectedRevision: revision(source.expectedRevision), grants: proofs(source.grants), input: mutation(source.input) }
    default:
      throw new TypeError('Invalid request')
  }
}
