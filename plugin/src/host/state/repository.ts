import { randomUUID } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { AuditEvent, CommitResult, VaultState } from './model.js'
import { emptyVaultState, parseAuditEvent, parseVaultState } from './schema.js'

const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600
const LOCK_RETRY_ATTEMPTS = 100
const LOCK_RETRY_DELAY_MS = 10
const CLEANUP_ATTEMPTS = 3
const STATE_TEMP_PREFIX = '.state.json.tmp-'
const BACKUP_TEMP_PREFIX = '.state.json.bak.tmp-'

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
  readdir(path: string): Promise<string[]>
  copyFile(source: string, destination: string): Promise<void>
  rename(source: string, destination: string): Promise<void>
  unlink(path: string): Promise<void>
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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

interface LockedCommit {
  readonly result: CommitResult
  readonly snapshot: VaultState
}

export class VaultStateRepository {
  readonly #statePath: string
  readonly #backupPath: string
  readonly #auditPath: string
  readonly #lockPath: string
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
    this.#lockPath = join(stateDirectory, 'state.lock')
  }

  load(): Promise<VaultState> {
    return this.#exclusive(async () => {
      const loaded = await this.#withStateLock(() => this.#loadFromDiskLocked())
      this.#snapshot = loaded
      return this.#snapshot
    })
  }

  commit(expectedRevision: number, next: VaultState): Promise<CommitResult> {
    return this.#exclusive(async () => {
      const committed = await this.#withStateLock(async (): Promise<LockedCommit> => {
        const current = await this.#loadFromDiskLocked()
        if (current.revision !== expectedRevision) {
          return { result: { ok: false, code: 'revision-conflict' }, snapshot: current }
        }

        const candidate = parseVaultState(structuredClone(next))
        if (candidate.revision !== expectedRevision + 1) {
          throw new TypeError('Next vault state revision must increment expectedRevision by one')
        }

        await this.#persist(candidate, true)
        return { result: { ok: true, revision: candidate.revision }, snapshot: freezeDeep(candidate) }
      })

      this.#snapshot = committed.snapshot
      return committed.result
    })
  }

  appendAudit(event: AuditEvent): Promise<void> {
    return this.#exclusive(() => this.#withStateLock(async () => {
      const parsed = parseAuditEvent(structuredClone(event))
      const line = `${JSON.stringify(parsed)}\n`

      let handle: RepositoryFileHandle
      try {
        handle = await this.fileSystem.open(this.#auditPath, 'ax', FILE_MODE)
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
        handle = await this.fileSystem.open(this.#auditPath, 'a', FILE_MODE)
      }

      await closeAfter(handle, async () => {
        await this.fileSystem.chmod(this.#auditPath, FILE_MODE)
        await handle.writeFile(line)
        await handle.sync()
      })
      await this.#syncDirectory()
    }))
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

  async #withStateLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#ensureDirectory()
    await this.#acquireStateLock()

    let result: T | undefined
    let operationError: unknown
    try {
      await this.#cleanupStaleTemps()
      result = await operation()
    } catch (error) {
      operationError = error
    }

    try {
      await this.#unlinkWithRetries(this.#lockPath, 'state lock')
    } catch (cleanupError) {
      if (operationError !== undefined) {
        throw new AggregateError(
          [operationError, cleanupError],
          'Vault state operation failed and state lock cleanup failed',
        )
      }
      throw cleanupError
    }

    if (operationError !== undefined) throw operationError
    return result as T
  }

  async #acquireStateLock(): Promise<void> {
    for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const handle = await this.fileSystem.open(this.#lockPath, 'wx', FILE_MODE)
        try {
          await handle.close()
        } catch (error) {
          await this.#unlinkWithRetries(this.#lockPath, 'state lock')
          throw error
        }
        return
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
        if (attempt === LOCK_RETRY_ATTEMPTS) {
          throw new Error('Vault state lock is busy; refusing unsafe concurrent access', { cause: error })
        }
        await delay(LOCK_RETRY_DELAY_MS)
      }
    }
  }

  async #loadFromDiskLocked(): Promise<VaultState> {
    await this.#ensureDirectory()
    const backupExists = await this.#secureBackupIfPresent()

    let source: string
    try {
      await this.fileSystem.chmod(this.#statePath, FILE_MODE)
      source = await this.fileSystem.readFile(this.#statePath, 'utf8')
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error
      if (backupExists) {
        throw new Error('Vault state is missing while a backup exists; explicit recovery is required')
      }
      const initial = freezeDeep(emptyVaultState())
      await this.#persist(initial, false)
      return initial
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(source)
    } catch (error) {
      throw new SyntaxError('Corrupt vault state JSON', { cause: error })
    }

    return freezeDeep(parseVaultState(decoded))
  }

  async #secureBackupIfPresent(): Promise<boolean> {
    try {
      await this.fileSystem.chmod(this.#backupPath, FILE_MODE)
      return true
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return false
      throw error
    }
  }

  async #persist(next: VaultState, currentExists: boolean): Promise<void> {
    await this.#ensureDirectory()
    const suffix = `${process.pid}-${randomUUID()}`
    const stateTempPath = join(this.stateDirectory, `${STATE_TEMP_PREFIX}${suffix}`)
    const backupTempPath = join(this.stateDirectory, `${BACKUP_TEMP_PREFIX}${suffix}`)
    let stateTempExists = false
    let backupTempExists = false
    let stateReplaced = false

    try {
      const stateTemp = await this.fileSystem.open(stateTempPath, 'wx', FILE_MODE)
      stateTempExists = true
      await closeAfter(stateTemp, async () => {
        await this.fileSystem.chmod(stateTempPath, FILE_MODE)
        await stateTemp.writeFile(`${JSON.stringify(next)}\n`)
        await stateTemp.sync()
      })

      if (currentExists) {
        const reservedBackupTemp = await this.fileSystem.open(backupTempPath, 'wx', FILE_MODE)
        backupTempExists = true
        await reservedBackupTemp.close()
        await this.fileSystem.copyFile(this.#statePath, backupTempPath)
        await this.fileSystem.chmod(backupTempPath, FILE_MODE)
        const backupTemp = await this.fileSystem.open(backupTempPath, 'r+')
        await closeAfter(backupTemp, () => backupTemp.sync())
      }

      await this.fileSystem.rename(stateTempPath, this.#statePath)
      stateTempExists = false
      stateReplaced = true
      await this.#syncDirectory()

      if (currentExists) {
        await this.fileSystem.rename(backupTempPath, this.#backupPath)
        backupTempExists = false
        await this.#syncDirectory()
      }
    } catch (error) {
      const cleanupErrors: unknown[] = []
      if (stateReplaced && backupTempExists) {
        try {
          await this.fileSystem.rename(backupTempPath, this.#statePath)
          backupTempExists = false
          stateReplaced = false
          await this.#syncDirectory()
        } catch (rollbackError) {
          cleanupErrors.push(new Error('Vault state rollback failed', { cause: rollbackError }))
        }
      }
      if (backupTempExists) {
        try {
          await this.#unlinkWithRetries(backupTempPath, 'backup temp')
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError)
        }
      }
      if (stateTempExists) {
        try {
          await this.#unlinkWithRetries(stateTempPath, 'state temp')
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError)
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Vault persistence failed and sensitive temp cleanup failed',
        )
      }
      throw error
    }
  }

  async #syncDirectory(): Promise<void> {
    const directory = await this.fileSystem.open(this.stateDirectory, 'r')
    await closeAfter(directory, () => directory.sync())
  }

  async #cleanupStaleTemps(): Promise<void> {
    const names = await this.fileSystem.readdir(this.stateDirectory)
    const staleNames = names.filter((name) =>
      name.startsWith(STATE_TEMP_PREFIX) || name.startsWith(BACKUP_TEMP_PREFIX))
    if (staleNames.length === 0) return

    for (const name of staleNames) {
      await this.#unlinkWithRetries(join(this.stateDirectory, name), 'stale temp')
    }
    await this.#syncDirectory()
  }

  async #unlinkWithRetries(path: string, label: string): Promise<void> {
    let lastError: unknown
    for (let attempt = 1; attempt <= CLEANUP_ATTEMPTS; attempt += 1) {
      try {
        await this.fileSystem.unlink(path)
        return
      } catch (error) {
        if (hasCode(error, 'ENOENT')) return
        lastError = error
      }
    }
    throw new Error(`Vault ${label} cleanup failed after ${CLEANUP_ATTEMPTS} attempts`, {
      cause: lastError,
    })
  }
}
