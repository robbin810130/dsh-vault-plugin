import type { SecretVerifier } from '../crypto/verifier.js'
import type { ProtectionBinding } from '../../shared/contracts.js'
import type { PasswordGroup, VaultState } from './model.js'

type JsonRecord = Record<string, unknown>

function invalid(path: string, message: string): never {
  throw new TypeError(`Invalid vault state at ${path}: ${message}`)
}

function record(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, 'expected an object')
  }
  return value as JsonRecord
}

function exactKeys(value: JsonRecord, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown) invalid(path, `unknown field ${JSON.stringify(unknown)}`)
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) invalid(path, 'expected a non-empty string')
  return value
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(path, 'expected a non-negative safe integer')
  }
  return value as number
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = nonNegativeInteger(value, path)
  if (parsed === 0) invalid(path, 'expected a positive safe integer')
  return parsed
}

function secretVerifier(value: unknown, path: string): SecretVerifier {
  const source = record(value, path)
  exactKeys(source, ['salt', 'verifier', 'kdf', 'parameters'], path)
  const parameters = record(source.parameters, `${path}.parameters`)
  exactKeys(parameters, ['cost', 'blockSize', 'parallelization', 'keyLength'], `${path}.parameters`)

  if (source.kdf !== 'scrypt') invalid(`${path}.kdf`, 'expected scrypt')
  if (parameters.cost !== 32768
    || parameters.blockSize !== 8
    || parameters.parallelization !== 1
    || parameters.keyLength !== 32) {
    invalid(`${path}.parameters`, 'unsupported scrypt parameters')
  }

  return {
    salt: string(source.salt, `${path}.salt`),
    verifier: string(source.verifier, `${path}.verifier`),
    kdf: 'scrypt',
    parameters: { cost: 32768, blockSize: 8, parallelization: 1, keyLength: 32 },
  }
}

function passwordGroup(value: unknown, path: string): PasswordGroup {
  const source = record(value, path)
  exactKeys(source, [
    'id',
    'name',
    'password',
    'recovery',
    'credentialVersion',
    'createdAt',
    'updatedAt',
  ], path)

  const recoverySource = record(source.recovery, `${path}.recovery`)
  exactKeys(recoverySource, [
    'salt',
    'verifier',
    'kdf',
    'parameters',
    'generatedAt',
    'lastVerifiedAt',
  ], `${path}.recovery`)
  const recoveryVerifier = secretVerifier({
    salt: recoverySource.salt,
    verifier: recoverySource.verifier,
    kdf: recoverySource.kdf,
    parameters: recoverySource.parameters,
  }, `${path}.recovery`)
  const lastVerifiedAt = recoverySource.lastVerifiedAt === undefined
    ? {}
    : { lastVerifiedAt: string(recoverySource.lastVerifiedAt, `${path}.recovery.lastVerifiedAt`) }

  return {
    id: string(source.id, `${path}.id`),
    name: string(source.name, `${path}.name`),
    password: secretVerifier(source.password, `${path}.password`),
    recovery: {
      ...recoveryVerifier,
      generatedAt: string(recoverySource.generatedAt, `${path}.recovery.generatedAt`),
      ...lastVerifiedAt,
    },
    credentialVersion: positiveInteger(source.credentialVersion, `${path}.credentialVersion`),
    createdAt: string(source.createdAt, `${path}.createdAt`),
    updatedAt: string(source.updatedAt, `${path}.updatedAt`),
  }
}

function protectionBinding(value: unknown, path: string): ProtectionBinding {
  const source = record(value, path)
  exactKeys(source, [
    'targetType',
    'targetId',
    'mode',
    'passwordGroupId',
    'workspaceId',
    'createdAt',
    'updatedAt',
  ], path)

  if (source.targetType !== 'workspace' && source.targetType !== 'session') {
    invalid(`${path}.targetType`, 'expected workspace or session')
  }
  if (source.mode !== 'direct' && source.mode !== 'inherit' && source.mode !== 'no-inherit') {
    invalid(`${path}.mode`, 'expected direct, inherit, or no-inherit')
  }

  return {
    targetType: source.targetType,
    targetId: string(source.targetId, `${path}.targetId`),
    mode: source.mode,
    ...(source.passwordGroupId === undefined
      ? {}
      : { passwordGroupId: string(source.passwordGroupId, `${path}.passwordGroupId`) }),
    ...(source.workspaceId === undefined
      ? {}
      : { workspaceId: string(source.workspaceId, `${path}.workspaceId`) }),
    createdAt: string(source.createdAt, `${path}.createdAt`),
    updatedAt: string(source.updatedAt, `${path}.updatedAt`),
  }
}

export function emptyVaultState(): VaultState {
  return { schemaVersion: 1, revision: 0, groups: {}, bindings: [] }
}

export function parseVaultState(value: unknown): VaultState {
  const source = record(value, '$')
  if (source.schemaVersion !== 1) {
    throw new TypeError(`Unsupported vault state schema version: ${String(source.schemaVersion)}`)
  }
  exactKeys(source, ['schemaVersion', 'revision', 'groups', 'bindings'], '$')

  const groupsSource = record(source.groups, '$.groups')
  const groups = Object.fromEntries(Object.entries(groupsSource).map(([id, group]) => {
    const parsed = passwordGroup(group, `$.groups.${JSON.stringify(id)}`)
    if (parsed.id !== id) invalid(`$.groups.${JSON.stringify(id)}.id`, 'must match its group key')
    return [id, parsed]
  }))
  if (!Array.isArray(source.bindings)) invalid('$.bindings', 'expected an array')

  return {
    schemaVersion: 1,
    revision: nonNegativeInteger(source.revision, '$.revision'),
    groups,
    bindings: source.bindings.map((binding, index) => protectionBinding(binding, `$.bindings[${index}]`)),
  }
}
