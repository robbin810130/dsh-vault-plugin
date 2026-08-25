import { randomUUID } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { AuditEvent, CommitResult, VaultState } from './model.js'
import { emptyVaultState, parseVaultState } from './schema.js'

const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600
const REDACTED = '[REDACTED]'

interface RepositoryFileHandle {
  writeFile(data: string): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface RepositoryFileSystem {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<string | undefined>
  chmod(path: string, mode: number): Promise<void>
  open(path: string, flags: string, mode?: number): Promise<RepositoryFileHandle>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  copyFile(source: string, destination: string): Promise<void>
  rename(source: string, destination: string): Promise<void>
  unlink(path: string): Promise<void>
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

function secretKey(key: string): boolean {
  const normalized = key.replaceAll('-', '').replaceAll('_', '').toLowerCase()
  return normalized === 'token'
    || normalized.endsWith('password')
    || normalized.endsWith('recoverykey')
    || normalized.endsWith('granttoken')
}

function sanitizeAuditValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Audit events require finite numbers')
    return value
  }
  if (value === undefined) return undefined
  if (typeof value !== 'object') throw new TypeError('Audit events must be JSON serializable')
  if (seen.has(value)) throw new TypeError('Audit events must not contain cycles')

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => sanitizeAuditValue(entry, seen) ?? null)
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (secretKey(key)) {
        sanitized[key] = REDACTED
        continue
      }
      const safe = sanitizeAuditValue(entry, seen)
      if (safe !== undefined) sanitized[key] = safe
    }
    return sanitized
  } finally {
    seen.delete(value)
  }
}

async function closeAfter(handle: RepositoryFileHandle, operation: () => Promise<void>): Promise<void> {
  let failed = false
  try {
    await operation()
  } catch (error) {
    failed = true
    throw error
  } finally {
    try {
      await handle.close()
    } catch (error) {
      if (!failed) throw error
    }
  }
}

export class VaultStateRepository {
  readonly #statePath: string
  readonly #backupPath: string
  readonly #auditPath: string
  #snapshot: VaultState | undefined
  #tail: Promise<void> = Promise.resolve()

  constructor(
    readonly stateDirectory: string,
    readonly fileSystem: RepositoryFileSystem = nodeFs,
  ) {
    if (!isAbsolute(stateDirectory)) throw new TypeError('Vault state directory must be absolute')
    this.#statePath = join(stateDirectory, 'state.json')
    this.#backupPath = join(stateDirectory, 'state.json.bak')
    this.#auditPath = join(stateDirectory, 'audit.jsonl')
  }

  load(): Promise<VaultState> {
    return this.#exclusive(() => this.#loadFromDisk())
  }

  commit(expectedRevision: number, next: VaultState): Promise<CommitResult> {
    return this.#exclusive(async () => {
      const current = this.#snapshot ?? await this.#loadFromDisk()
      if (current.revision !== expectedRevision) {
        return { ok: false, code: 'revision-conflict' }
      }

      const candidate = parseVaultState(structuredClone(next))
      if (candidate.revision !== expectedRevision + 1) {
        throw new TypeError('Next vault state revision must increment expectedRevision by one')
      }

      await this.#persist(candidate, true)
      this.#snapshot = freezeDeep(candidate)
      return { ok: true, revision: candidate.revision }
    })
  }

  appendAudit(event: AuditEvent): Promise<void> {
    return this.#exclusive(async () => {
      const source = sanitizeAuditValue(event, new Set())
      if (source === null || typeof source !== 'object' || Array.isArray(source)) {
        throw new TypeError('Audit event must be an object')
      }
      const line = `${JSON.stringify(source)}\n`

      await this.#ensureDirectory()
      const handle = await this.fileSystem.open(this.#auditPath, 'a', FILE_MODE)
      await closeAfter(handle, async () => {
        await this.fileSystem.chmod(this.#auditPath, FILE_MODE)
        await handle.writeFile(line)
        await handle.sync()
      })
    })
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation, operation)
    this.#tail = result.then(() => undefined, () => undefined)
    return result
  }

  async #ensureDirectory(): Promise<void> {
    await this.fileSystem.mkdir(this.stateDirectory, { recursive: true, mode: DIRECTORY_MODE })
    await this.fileSystem.chmod(this.stateDirectory, DIRECTORY_MODE)
  }

  async #loadFromDisk(): Promise<VaultState> {
    await this.#ensureDirectory()

    let source: string
    try {
      await this.fileSystem.chmod(this.#statePath, FILE_MODE)
      source = await this.fileSystem.readFile(this.#statePath, 'utf8')
    } catch (error) {
      if (!isMissing(error)) throw error
      const initial = freezeDeep(emptyVaultState())
      await this.#persist(initial, false)
      this.#snapshot = initial
      return initial
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(source)
    } catch (error) {
      throw new SyntaxError('Corrupt vault state JSON', { cause: error })
    }

    const loaded = freezeDeep(parseVaultState(decoded))
    this.#snapshot = loaded
    return loaded
  }

  async #persist(next: VaultState, currentExists: boolean): Promise<void> {
    await this.#ensureDirectory()
    const tempPath = join(this.stateDirectory, `.state.json.tmp-${process.pid}-${randomUUID()}`)
    let tempExists = false
    let replaced = false

    try {
      const handle = await this.fileSystem.open(tempPath, 'wx', FILE_MODE)
      tempExists = true
      await closeAfter(handle, async () => {
        await handle.writeFile(`${JSON.stringify(next)}\n`)
        await handle.sync()
      })

      if (currentExists) {
        await this.fileSystem.copyFile(this.#statePath, this.#backupPath)
        await this.fileSystem.chmod(this.#backupPath, FILE_MODE)
      }

      await this.fileSystem.rename(tempPath, this.#statePath)
      tempExists = false
      replaced = true

      const directory = await this.fileSystem.open(this.stateDirectory, 'r')
      await closeAfter(directory, () => directory.sync())
    } catch (error) {
      if (replaced) this.#snapshot = undefined
      throw error
    } finally {
      if (tempExists) {
        try {
          await this.fileSystem.unlink(tempPath)
        } catch (error) {
          if (!isMissing(error)) {
            // Preserve the persistence failure; a stale temp is never treated as committed state.
          }
        }
      }
    }
  }
}
