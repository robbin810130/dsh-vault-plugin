import * as fs from 'node:fs/promises'
import type { PathLike } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VaultState } from '../../src/host/state/model.js'
import {
  type RepositoryFileSystem,
  VaultStateRepository,
} from '../../src/host/state/repository.js'

const STATE_FILE = 'state.json'
const BACKUP_FILE = 'state.json.bak'
const AUDIT_FILE = 'audit.jsonl'

function verifier(seed: string) {
  return {
    salt: Buffer.alloc(16, seed).toString('base64'),
    verifier: Buffer.alloc(32, seed).toString('base64'),
    kdf: 'scrypt' as const,
    parameters: { cost: 32768, blockSize: 8, parallelization: 1, keyLength: 32 } as const,
  }
}

function stateAt(revision: number): VaultState {
  if (revision === 0) {
    return { schemaVersion: 1, revision, groups: {}, bindings: [] }
  }

  const password = verifier(`password-${revision}`)
  const recovery = verifier(`recovery-${revision}`)
  return {
    schemaVersion: 1,
    revision,
    groups: {
      primary: {
        id: 'primary',
        name: `Primary ${revision}`,
        password,
        recovery: { ...recovery, generatedAt: '2026-08-25T00:00:00.000Z' },
        credentialVersion: revision,
        createdAt: '2026-08-25T00:00:00.000Z',
        updatedAt: '2026-08-25T00:00:00.000Z',
      },
    },
    bindings: [{
      targetType: 'workspace',
      targetId: 'workspace-1',
      mode: 'direct',
      passwordGroupId: 'primary',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    }],
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path, 'utf8'))
}

async function mode(path: string): Promise<number> {
  return (await fs.stat(path)).mode & 0o777
}

function ioError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('VaultStateRepository', () => {
  let root: string
  let dir: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'dsh-vault-state-'))
    dir = join(root, 'vault-lock')
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('creates and durably persists the empty first-load state with private modes', async () => {
    const repo = new VaultStateRepository(dir)

    await expect(repo.load()).resolves.toEqual(stateAt(0))
    await expect(readJson(join(dir, STATE_FILE))).resolves.toEqual(stateAt(0))
    await expect(mode(dir)).resolves.toBe(0o700)
    await expect(mode(join(dir, STATE_FILE))).resolves.toBe(0o600)
  })

  it('returns a revision conflict without replacing persisted state', async () => {
    const repo = new VaultStateRepository(dir)
    await repo.load()

    await expect(repo.commit(7, stateAt(8))).resolves.toEqual({
      ok: false,
      code: 'revision-conflict',
    })
    await expect(readJson(join(dir, STATE_FILE))).resolves.toEqual(stateAt(0))
  })

  it('serializes concurrent repositories so a stale writer cannot overwrite committed state', async () => {
    await new VaultStateRepository(dir).load()
    const stateTempOpened = deferred()
    const releaseStateWrite = deferred()
    const delayingFs: RepositoryFileSystem = {
      ...fs,
      open: async (path, flags, fileMode) => {
        const handle = await fs.open(path, flags, fileMode)
        const delayWrite = flags === 'wx' && String(path).includes('.state.json.tmp-')
        return {
          writeFile: async (data) => {
            if (delayWrite) {
              stateTempOpened.resolve()
              await releaseStateWrite.promise
            }
            await handle.writeFile(data)
          },
          sync: () => handle.sync(),
          close: () => handle.close(),
        }
      },
    }
    const first = new VaultStateRepository(dir, delayingFs)
    const second = new VaultStateRepository(dir)
    await Promise.all([first.load(), second.load()])

    const firstCommit = first.commit(0, stateAt(1))
    await stateTempOpened.promise
    const secondCommit = second.commit(0, stateAt(1))
    releaseStateWrite.resolve()

    await expect(firstCommit).resolves.toEqual({ ok: true, revision: 1 })
    await expect(secondCommit).resolves.toEqual({ ok: false, code: 'revision-conflict' })
    await expect(readJson(join(dir, STATE_FILE))).resolves.toEqual(stateAt(1))
  })

  it('keeps the previous state, retries temp cleanup, and retains the in-memory revision when state rename fails', async () => {
    await new VaultStateRepository(dir).load()
    let renameError: Error | undefined = new Error('disk full')
    let tempUnlinkAttempts = 0
    const faultingFs = {
      ...fs,
      rename: async (oldPath: PathLike, newPath: PathLike) => {
        if (renameError && String(newPath) === join(dir, STATE_FILE)) throw renameError
        return fs.rename(oldPath, newPath)
      },
      unlink: async (path: PathLike) => {
        if (String(path).includes('.tmp-') && tempUnlinkAttempts++ === 0) {
          throw ioError('temporarily busy', 'EBUSY')
        }
        return fs.unlink(path)
      },
    }
    const repo = new VaultStateRepository(dir, faultingFs)
    await repo.load()

    await expect(repo.commit(0, stateAt(1))).rejects.toThrow('disk full')
    await expect(readJson(join(dir, STATE_FILE))).resolves.toEqual(stateAt(0))
    expect((await fs.readdir(dir)).filter((name) => name.includes('.tmp-'))).toEqual([])

    renameError = undefined
    await expect(repo.commit(0, stateAt(1))).resolves.toEqual({ ok: true, revision: 1 })
  })

  it('fails closed with an explicit cleanup error when a sensitive temp cannot be removed', async () => {
    await new VaultStateRepository(dir).load()
    const faultingFs = {
      ...fs,
      rename: async (oldPath: PathLike, newPath: PathLike) => {
        if (String(newPath) === join(dir, STATE_FILE)) throw new Error('disk full')
        return fs.rename(oldPath, newPath)
      },
      unlink: async (path: PathLike) => {
        if (String(path).includes('.tmp-')) throw ioError('device busy', 'EBUSY')
        return fs.unlink(path)
      },
    }
    const repo = new VaultStateRepository(dir, faultingFs)
    await repo.load()

    await expect(repo.commit(0, stateAt(1))).rejects.toThrow(/cleanup/i)
    await expect(readJson(join(dir, STATE_FILE))).resolves.toEqual(stateAt(0))
  })

  it('performs the replacement from a same-directory temp while the old state remains readable', async () => {
    await new VaultStateRepository(dir).load()
    let observedState: unknown
    let observedSourceDirectory: string | undefined
    const observingFs = {
      ...fs,
      rename: async (oldPath: PathLike, newPath: PathLike) => {
        if (String(newPath) === join(dir, STATE_FILE)) {
          observedState = await readJson(join(dir, STATE_FILE))
          observedSourceDirectory = dirname(String(oldPath))
        }
        return fs.rename(oldPath, newPath)
      },
    }
    const repo = new VaultStateRepository(dir, observingFs)

    await expect(repo.commit(0, stateAt(1))).resolves.toEqual({ ok: true, revision: 1 })
    expect(observedState).toEqual(stateAt(0))
    expect(observedSourceDirectory).toBe(dir)
    await expect(readJson(join(dir, STATE_FILE))).resolves.toEqual(stateAt(1))
  })

  it('orders temp durability, backup, replacement, and directory durability exactly', async () => {
    await new VaultStateRepository(dir).load()
    const calls: string[] = []
    const orderingFs: RepositoryFileSystem = {
      ...fs,
      open: async (path, flags, fileMode) => {
        const handle = await fs.open(path, flags, fileMode)
        const isStateTemp = String(path).includes('.state.json.tmp-')
        const isBackupTemp = String(path).includes('.state.json.bak.tmp-')
        const isDirectory = String(path) === dir
        if (isStateTemp && flags === 'wx') calls.push('state-temp-open')
        if (isBackupTemp && flags === 'wx') calls.push('backup-temp-open')
        if (isBackupTemp && flags === 'r+') calls.push('backup-sync-open')
        if (isDirectory) calls.push('directory-open')

        return {
          writeFile: async (data) => {
            if (isStateTemp) calls.push('state-temp-write')
            await handle.writeFile(data)
          },
          sync: async () => {
            if (isStateTemp) calls.push('state-temp-sync')
            if (isBackupTemp && flags === 'r+') calls.push('backup-temp-sync')
            if (isDirectory) calls.push('directory-sync')
            await handle.sync()
          },
          close: () => handle.close(),
        }
      },
      copyFile: async (source, destination) => {
        calls.push('backup-copy')
        await fs.copyFile(source, destination)
      },
      rename: async (source, destination) => {
        calls.push(String(destination) === join(dir, BACKUP_FILE) ? 'backup-rename' : 'state-rename')
        await fs.rename(source, destination)
      },
    }
    const repo = new VaultStateRepository(dir, orderingFs)

    await repo.commit(0, stateAt(1))

    expect(calls).toEqual([
      'state-temp-open',
      'state-temp-write',
      'state-temp-sync',
      'backup-temp-open',
      'backup-copy',
      'backup-sync-open',
      'backup-temp-sync',
      'backup-rename',
      'directory-open',
      'directory-sync',
      'state-rename',
      'directory-open',
      'directory-sync',
    ])
  })

  it('preserves the previous backup when creating the next backup fails', async () => {
    const repo = new VaultStateRepository(dir)
    await repo.load()
    await repo.commit(0, stateAt(1))
    await expect(readJson(join(dir, BACKUP_FILE))).resolves.toEqual(stateAt(0))

    const faultingFs = {
      ...fs,
      copyFile: async (_source: PathLike, destination: PathLike) => {
        await fs.writeFile(destination, '{partial')
        throw new Error('backup copy failed')
      },
    }
    const faultingRepo = new VaultStateRepository(dir, faultingFs)
    await faultingRepo.load()

    await expect(faultingRepo.commit(1, stateAt(2))).rejects.toThrow('backup copy failed')
    await expect(readJson(join(dir, STATE_FILE))).resolves.toEqual(stateAt(1))
    await expect(readJson(join(dir, BACKUP_FILE))).resolves.toEqual(stateAt(0))
    expect((await fs.readdir(dir)).filter((name) => name.includes('.tmp-'))).toEqual([])
  })

  it('retains a private backup containing the immediately previous state', async () => {
    const repo = new VaultStateRepository(dir)
    await repo.load()

    await repo.commit(0, stateAt(1))
    await expect(readJson(join(dir, BACKUP_FILE))).resolves.toEqual(stateAt(0))
    await repo.commit(1, stateAt(2))
    await expect(readJson(join(dir, BACKUP_FILE))).resolves.toEqual(stateAt(1))
    await expect(mode(join(dir, BACKUP_FILE))).resolves.toBe(0o600)
  })

  it('refuses to initialize when state is missing but a backup exists', async () => {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    await fs.writeFile(join(dir, BACKUP_FILE), JSON.stringify(stateAt(3)), { mode: 0o600 })

    await expect(new VaultStateRepository(dir).load()).rejects.toThrow(/backup|recover/i)
    await expect(fs.access(join(dir, STATE_FILE))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readJson(join(dir, BACKUP_FILE))).resolves.toEqual(stateAt(3))
  })

  it('tightens an existing backup to private permissions during load', async () => {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    await fs.writeFile(join(dir, STATE_FILE), JSON.stringify(stateAt(1)), { mode: 0o600 })
    await fs.writeFile(join(dir, BACKUP_FILE), JSON.stringify(stateAt(0)), { mode: 0o644 })

    await new VaultStateRepository(dir).load()

    await expect(mode(join(dir, BACKUP_FILE))).resolves.toBe(0o600)
  })

  it('refuses corrupt JSON without resetting or replacing it', async () => {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    const corrupt = '{not-json'
    await fs.writeFile(join(dir, STATE_FILE), corrupt, { mode: 0o600 })

    await expect(new VaultStateRepository(dir).load()).rejects.toThrow(/corrupt|JSON/i)
    await expect(fs.readFile(join(dir, STATE_FILE), 'utf8')).resolves.toBe(corrupt)
  })

  it('refuses an unsupported schema without resetting it', async () => {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    const unsupported = { ...stateAt(0), schemaVersion: 2 }
    await fs.writeFile(join(dir, STATE_FILE), JSON.stringify(unsupported), { mode: 0o600 })

    await expect(new VaultStateRepository(dir).load()).rejects.toThrow(/schema/i)
    await expect(readJson(join(dir, STATE_FILE))).resolves.toEqual(unsupported)
  })

  it.each([
    ['non-canonical salt encoding', Buffer.alloc(16, 1).toString('base64').replace(/=+$/, '')],
    ['a 15-byte salt', Buffer.alloc(15, 1).toString('base64')],
  ])('refuses %s', async (_label, salt) => {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    const invalid = JSON.parse(JSON.stringify(stateAt(1))) as {
      groups: Record<string, { password: { salt: string } }>
    }
    invalid.groups.primary!.password.salt = salt
    await fs.writeFile(join(dir, STATE_FILE), JSON.stringify(invalid), { mode: 0o600 })

    await expect(new VaultStateRepository(dir).load()).rejects.toThrow(/salt|base64|16/i)
  })

  it('refuses a verifier that is not exactly 32 bytes', async () => {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    const invalid = JSON.parse(JSON.stringify(stateAt(1))) as {
      groups: Record<string, { password: { verifier: string } }>
    }
    invalid.groups.primary!.password.verifier = Buffer.alloc(31, 1).toString('base64')
    await fs.writeFile(join(dir, STATE_FILE), JSON.stringify(invalid), { mode: 0o600 })

    await expect(new VaultStateRepository(dir).load()).rejects.toThrow(/verifier|base64|32/i)
  })

  it('writes only allowlisted private audit fields', async () => {
    const repo = new VaultStateRepository(dir)
    await repo.appendAudit({
      timestamp: '2026-08-25T00:00:00.000Z',
      action: 'unlock-denied',
      groupId: 'primary',
      clientInstanceId: 'client-1',
      count: 1,
      result: 'denied',
      reasonCode: 'invalid-credential',
    })

    const raw = await fs.readFile(join(dir, AUDIT_FILE), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(JSON.parse(raw)).toEqual({
      timestamp: '2026-08-25T00:00:00.000Z',
      action: 'unlock-denied',
      groupId: 'primary',
      clientInstanceId: 'client-1',
      count: 1,
      result: 'denied',
      reasonCode: 'invalid-credential',
    })
    await expect(mode(dir)).resolves.toBe(0o700)
    await expect(mode(join(dir, AUDIT_FILE))).resolves.toBe(0o600)
  })

  it.each(['passwordValue', 'recoveryKeyValue', 'grantTokenValue', 'value'])(
    'rejects the non-allowlisted audit field %s without writing it',
    async (field) => {
      const repo = new VaultStateRepository(dir)
      const appendUnknown = repo.appendAudit.bind(repo) as (event: unknown) => Promise<void>

      await expect(appendUnknown({
        timestamp: '2026-08-25T00:00:00.000Z',
        action: 'unlock-denied',
        [field]: `plain-${field}`,
      })).rejects.toThrow(/unknown|audit/i)
      await expect(fs.access(join(dir, AUDIT_FILE))).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )

  it('syncs the directory after first creating the audit file', async () => {
    const calls: string[] = []
    const observingFs: RepositoryFileSystem = {
      ...fs,
      open: async (path, flags, fileMode) => {
        const handle = await fs.open(path, flags, fileMode)
        const isAudit = String(path) === join(dir, AUDIT_FILE)
        const isDirectory = String(path) === dir
        if (isAudit) calls.push('audit-open')
        if (isDirectory) calls.push('directory-open')
        return {
          writeFile: (data) => handle.writeFile(data).then(() => undefined),
          sync: async () => {
            if (isAudit) calls.push('audit-sync')
            if (isDirectory) calls.push('directory-sync')
            await handle.sync()
          },
          close: () => handle.close(),
        }
      },
    }

    await new VaultStateRepository(dir, observingFs).appendAudit({
      timestamp: '2026-08-25T00:00:00.000Z',
      action: 'repository-loaded',
    })

    expect(calls).toEqual(['audit-open', 'audit-sync', 'directory-open', 'directory-sync'])
  })
})
