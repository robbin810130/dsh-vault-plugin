import { createHash, randomUUID } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import { hostname } from 'node:os'
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
const STATE_RESTORE_TEMP_PREFIX = '.state.json.restore.tmp-'
const BACKUP_RESTORE_TEMP_PREFIX = '.state.json.bak.restore.tmp-'
const RECOVERY_FILE = 'state.recovery.json'
const RECOVERY_TEMP_PREFIX = '.state.recovery.json.tmp-'

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
  link(source: string, destination: string): Promise<void>
  rename(source: string, destination: string): Promise<void>
  unlink(path: string): Promise<void>
  truncate(path: string, length: number): Promise<void>
}

export class VaultStateLockError extends Error {
  constructor(readonly code: 'state-lock-busy' | 'state-lock-recovery-required') {
    super(code === 'state-lock-busy'
      ? 'Vault state lock is busy; refusing unsafe concurrent access'
      : 'Vault state lock ownership is unknown; stop all Vault processes and recover the lock explicitly')
  }
}

interface LockOwner { version: 1; pid: number; hostname: string; token: string }

function localOwner(source: string): LockOwner {
  try {
    const owner = JSON.parse(source) as LockOwner
    if (owner.version === 1 && Number.isSafeInteger(owner.pid) && owner.pid > 0
      && owner.hostname === hostname() && typeof owner.token === 'string' && owner.token.length > 0) return owner
  } catch { /* Legacy empty or malformed records cannot prove a dead owner. */ }
  throw new VaultStateLockError('state-lock-recovery-required')
}

function isDead(owner: LockOwner): boolean {
  try { process.kill(owner.pid, 0); return false } catch (error) {
    // EPERM and PID reuse are deliberately treated as live, never as expiry.
    return hasCode(error, 'ESRCH')
  }
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

  commitWithAudit(
    expectedRevision: number,
    next: VaultState,
    attempt: AuditEvent,
    success: AuditEvent,
  ): Promise<CommitResult> {
    return this.#exclusive(async () => {
      const committed = await this.#withStateLock(async (): Promise<LockedCommit> => {
        const current = await this.#loadFromDiskLocked()
        if (current.revision !== expectedRevision) {
          await this.#appendAuditLocked(attempt)
          return { result: { ok: false, code: 'revision-conflict' }, snapshot: current }
        }

        const candidate = parseVaultState(structuredClone(next))
        if (candidate.revision !== expectedRevision + 1) {
          throw new TypeError('Next vault state revision must increment expectedRevision by one')
        }

        const stateBefore = await this.fileSystem.readFile(this.#statePath, 'utf8')
        const backupBefore = await this.#readOptional(this.#backupPath)
        await this.#appendAuditLocked(attempt)
        await this.#persist(candidate, true)
        try {
          await this.#appendAuditLocked(success)
        } catch (error) {
          try {
            await this.#restoreStateFilesLocked(stateBefore, backupBefore)
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'Vault audit commit rollback failed')
          }
          throw error
        }
        return { result: { ok: true, revision: candidate.revision }, snapshot: freezeDeep(candidate) }
      })

      this.#snapshot = committed.snapshot
      return committed.result
    })
  }

  appendAudit(event: AuditEvent): Promise<void> {
    return this.#exclusive(() => this.#withStateLock(() => this.#appendAuditLocked(event)))
  }

  async #appendAuditLocked(event: AuditEvent): Promise<void> {
    const parsed = parseAuditEvent(structuredClone(event))
    const line = `${JSON.stringify(parsed)}\n`
    const original = await this.#readOptional(this.#auditPath)
    const originalLength = original === undefined ? 0 : Buffer.byteLength(original)

    try {
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
    } catch (error) {
      try {
        await this.#restoreAuditLocked(original !== undefined, originalLength)
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Vault audit append rollback failed')
      }
      throw error
    }
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
    const owner = await this.#acquireStateLock()

    let result: T | undefined
    let operationError: unknown
    try {
      await this.#recoverInterruptedPersist()
      await this.#cleanupStaleTemps()
      result = await operation()
    } catch (error) {
      operationError = error
    }

    try {
      if (await this.#readOptional(this.#lockPath) !== owner) {
        throw new VaultStateLockError('state-lock-recovery-required')
      }
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

  async #acquireStateLock(): Promise<string> {
    const owner = JSON.stringify({ version: 1, pid: process.pid, hostname: hostname(), token: randomUUID() })
    const candidate = join(this.stateDirectory, `.state-lock-owner-${process.pid}-${randomUUID()}`)
    const handle = await this.fileSystem.open(candidate, 'wx', FILE_MODE)
    let acquired = false
    try {
      await closeAfter(handle, async () => { await handle.writeFile(owner); await handle.sync() })
      for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt += 1) {
        try {
          // link is exclusive and exposes an already complete owner record.
          await this.fileSystem.link(candidate, this.#lockPath)
          acquired = true
          return owner
        } catch (error) {
          if (!hasCode(error, 'EEXIST')) throw error
          const current = await this.#readOptional(this.#lockPath)
          if (current === undefined) continue
          if (isDead(localOwner(current))) await this.#reclaimDeadLock(current, candidate)
          if (attempt === LOCK_RETRY_ATTEMPTS) throw new VaultStateLockError('state-lock-busy')
          await delay(LOCK_RETRY_DELAY_MS)
        }
      }
      throw new VaultStateLockError('state-lock-busy')
    } finally {
      try { await this.#unlinkWithRetries(candidate, 'lock owner candidate') } catch (error) {
        if (acquired) await this.#unlinkWithRetries(this.#lockPath, 'state lock')
        throw error
      }
    }
  }

  async #reclaimDeadLock(observed: string, candidate: string): Promise<void> {
    // One permanent tombstone per dead generation prevents delayed contenders
    // from deleting a replacement lock (check-then-unlink ABA). It also leaves
    // evidence for offline repair if the winning reaper itself is killed.
    const digest = createHash('sha256').update(observed).digest('hex')
    const claim = join(this.stateDirectory, `.state-lock-reaped-${digest}`)
    try { await this.fileSystem.link(candidate, claim) } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error
      if (await this.#readOptional(this.#lockPath) === observed) {
        const reaper = await this.#readOptional(claim)
        if (reaper !== undefined && isDead(localOwner(reaper))) {
          throw new VaultStateLockError('state-lock-recovery-required')
        }
      }
      return
    }
    if (await this.#readOptional(this.#lockPath) === observed && isDead(localOwner(observed))) {
      await this.#unlinkWithRetries(this.#lockPath, 'dead state lock')
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
    // One undo record, protected by the existing state lock. A pending record
    // always restores the exact original pair before any subsequent operation.
    if (!currentExists) return this.#persistState(next, false)
    const recoveryPath = join(this.stateDirectory, RECOVERY_FILE)
    const tempPath = join(this.stateDirectory, `${RECOVERY_TEMP_PREFIX}${randomUUID()}`)
    const record = JSON.stringify({
      version: 1,
      state: await this.fileSystem.readFile(this.#statePath, 'utf8'),
      backup: await this.#readOptional(this.#backupPath) ?? null,
    })
    try {
      const handle = await this.fileSystem.open(tempPath, 'wx', FILE_MODE)
      await closeAfter(handle, async () => { await handle.writeFile(record); await handle.sync() })
      await this.fileSystem.link(tempPath, recoveryPath)
      await this.#syncDirectory()
    } finally {
      await this.#unlinkWithRetries(tempPath, 'recovery temp')
    }
    // On failure leave the record for the next lock holder, even when rollback
    // failed or was killed. Never discard its only durable undo evidence.
    await this.#persistState(next, true)
    // Both new generations are durable. Removing the undo record is the commit
    // point. Errors here have an indeterminate outcome; never undo a committed
    // pair after the record has been removed.
    await this.#clearRecoveryRecord()
  }

  async #clearRecoveryRecord(): Promise<void> {
    await this.#unlinkWithRetries(join(this.stateDirectory, RECOVERY_FILE), 'recovery record')
    await this.#syncDirectory()
  }

  async #recoverInterruptedPersist(): Promise<void> {
    const source = await this.#readOptional(join(this.stateDirectory, RECOVERY_FILE))
    if (source === undefined) return
    let record: { version: number; state: string; backup: string | null }
    try {
      record = JSON.parse(source)
      if (record.version !== 1 || typeof record.state !== 'string'
        || (record.backup !== null && typeof record.backup !== 'string')) throw new Error('Invalid recovery record')
      parseVaultState(JSON.parse(record.state))
    } catch (error) {
      throw new Error('Vault persistence recovery record is invalid; explicit recovery is required', { cause: error })
    }
    // Atomic replacement of each file; the record remains throughout both
    // replacements, so recovery can itself be interrupted and safely replayed.
    if (await this.#readOptional(this.#statePath) !== record.state
      || await this.#readOptional(this.#backupPath) !== (record.backup ?? undefined)) {
      await this.#restoreStateFilesLocked(record.state, record.backup ?? undefined)
    } else {
      // A previous rollback may have restored the bytes but failed durability.
      await this.#syncFile(this.#statePath)
      if (record.backup !== null) await this.#syncFile(this.#backupPath)
      await this.#syncDirectory()
    }
    await this.#clearRecoveryRecord()
  }

  async #persistState(next: VaultState, currentExists: boolean): Promise<void> {
    await this.#ensureDirectory()
    const backupBefore = currentExists ? await this.#readOptional(this.#backupPath) : undefined
    const suffix = `${process.pid}-${randomUUID()}`
    const stateTempPath = join(this.stateDirectory, `${STATE_TEMP_PREFIX}${suffix}`)
    const backupTempPath = join(this.stateDirectory, `${BACKUP_TEMP_PREFIX}${suffix}`)
    let stateTempExists = false
    let backupTempExists = false
    let stateReplaced = false
    let backupPublished = false

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
        backupPublished = true
        await this.#syncDirectory()
      }
    } catch (error) {
      const cleanupErrors: unknown[] = []
      if (stateReplaced && backupPublished) {
        try {
          await this.fileSystem.copyFile(this.#backupPath, this.#statePath)
          await this.fileSystem.chmod(this.#statePath, FILE_MODE)
          await this.#syncFile(this.#statePath)
          // The newly published backup contains the old primary, not the old
          // backup generation. Restore that separately before rejecting.
          if (backupBefore === undefined) {
            await this.#unlinkWithRetries(this.#backupPath, 'backup rollback')
          } else {
            const restore = await this.fileSystem.open(backupTempPath, 'wx', FILE_MODE)
            backupTempExists = true
            await closeAfter(restore, async () => { await restore.writeFile(backupBefore); await restore.sync() })
            await this.fileSystem.rename(backupTempPath, this.#backupPath)
            backupTempExists = false
          }
          stateReplaced = false
          backupPublished = false
          await this.#syncDirectory()
        } catch (rollbackError) {
          cleanupErrors.push(new Error('Vault state rollback failed', { cause: rollbackError }))
        }
      } else if (stateReplaced && backupTempExists) {
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

  async #syncFile(path: string): Promise<void> {
    const file = await this.fileSystem.open(path, 'r+')
    await closeAfter(file, () => file.sync())
  }

  async #readOptional(path: string): Promise<string | undefined> {
    try {
      return await this.fileSystem.readFile(path, 'utf8')
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return undefined
      throw error
    }
  }

  async #restoreAuditLocked(originalExists: boolean, originalLength: number): Promise<void> {
    if (originalExists) {
      await this.fileSystem.truncate(this.#auditPath, originalLength)
      await this.#syncFile(this.#auditPath)
    } else {
      await this.#unlinkWithRetries(this.#auditPath, 'audit rollback')
    }
    await this.#syncDirectory()
  }

  async #restoreStateFilesLocked(stateBefore: string, backupBefore: string | undefined): Promise<void> {
    await this.#ensureDirectory()
    const suffix = `${process.pid}-${randomUUID()}`
    const stateRestorePath = join(this.stateDirectory, `${STATE_RESTORE_TEMP_PREFIX}${suffix}`)
    const backupRestorePath = join(this.stateDirectory, `${BACKUP_RESTORE_TEMP_PREFIX}${suffix}`)
    let stateRestoreExists = false
    let backupRestoreExists = false

    try {
      const stateRestore = await this.fileSystem.open(stateRestorePath, 'wx', FILE_MODE)
      stateRestoreExists = true
      await closeAfter(stateRestore, async () => {
        await this.fileSystem.chmod(stateRestorePath, FILE_MODE)
        await stateRestore.writeFile(stateBefore)
        await stateRestore.sync()
      })

      if (backupBefore !== undefined) {
        const backupRestore = await this.fileSystem.open(backupRestorePath, 'wx', FILE_MODE)
        backupRestoreExists = true
        await closeAfter(backupRestore, async () => {
          await this.fileSystem.chmod(backupRestorePath, FILE_MODE)
          await backupRestore.writeFile(backupBefore)
          await backupRestore.sync()
        })
      }

      await this.fileSystem.rename(stateRestorePath, this.#statePath)
      stateRestoreExists = false
      await this.#syncDirectory()

      if (backupBefore !== undefined) {
        await this.fileSystem.rename(backupRestorePath, this.#backupPath)
        backupRestoreExists = false
        await this.#syncDirectory()
      } else {
        await this.#unlinkWithRetries(this.#backupPath, 'backup rollback')
        await this.#syncDirectory()
      }
    } catch (error) {
      const cleanupErrors: unknown[] = []
      if (stateRestoreExists) {
        try {
          await this.#unlinkWithRetries(stateRestorePath, 'state restore temp')
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError)
        }
      }
      if (backupRestoreExists) {
        try {
          await this.#unlinkWithRetries(backupRestorePath, 'backup restore temp')
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError)
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Vault state restore failed and sensitive temp cleanup failed',
        )
      }
      throw error
    }
  }

  async #cleanupStaleTemps(): Promise<void> {
    const names = await this.fileSystem.readdir(this.stateDirectory)
    const staleNames = names.filter((name) =>
      name.startsWith(STATE_TEMP_PREFIX) ||
      name.startsWith(BACKUP_TEMP_PREFIX) ||
      name.startsWith(STATE_RESTORE_TEMP_PREFIX) ||
      name.startsWith(BACKUP_RESTORE_TEMP_PREFIX) ||
      name.startsWith(RECOVERY_TEMP_PREFIX))
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
