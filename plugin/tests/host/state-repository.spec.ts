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

  it('keeps the previous state, cleans the temp file, and retains the in-memory revision when rename fails', async () => {
    await new VaultStateRepository(dir).load()
    let renameError: Error | undefined = new Error('disk full')
    const faultingFs = {
      ...fs,
      rename: async (oldPath: PathLike, newPath: PathLike) => {
        if (renameError) throw renameError
        return fs.rename(oldPath, newPath)
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

  it('performs the replacement from a same-directory temp while the old state remains readable', async () => {
    await new VaultStateRepository(dir).load()
    let observedState: unknown
    let observedSourceDirectory: string | undefined
    const observingFs = {
      ...fs,
      rename: async (oldPath: PathLike, newPath: PathLike) => {
        observedState = await readJson(join(dir, STATE_FILE))
        observedSourceDirectory = dirname(String(oldPath))
        expect(String(newPath)).toBe(join(dir, STATE_FILE))
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
        const isTemp = flags === 'wx'
        const isDirectory = String(path) === dir
        if (isTemp) calls.push('temp-open')
        if (isDirectory) calls.push('directory-open')

        return {
          writeFile: async (data) => {
            if (isTemp) calls.push('temp-write')
            await handle.writeFile(data)
          },
          sync: async () => {
            if (isTemp) calls.push('temp-sync')
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
        calls.push('state-rename')
        await fs.rename(source, destination)
      },
    }
    const repo = new VaultStateRepository(dir, orderingFs)

    await repo.commit(0, stateAt(1))

    expect(calls).toEqual([
      'temp-open',
      'temp-write',
      'temp-sync',
      'backup-copy',
      'state-rename',
      'directory-open',
      'directory-sync',
    ])
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

  it('writes private audit lines while recursively redacting secret-bearing fields', async () => {
    const repo = new VaultStateRepository(dir)
    await repo.appendAudit({
      action: 'unlock-denied',
      groupId: 'primary',
      password: 'plain-password',
      recoveryKey: 'PLAIN-RECOVERY-KEY',
      nested: { grantToken: 'plain-grant-token', safe: 'kept' },
    })

    const raw = await fs.readFile(join(dir, AUDIT_FILE), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).not.toContain('plain-password')
    expect(raw).not.toContain('PLAIN-RECOVERY-KEY')
    expect(raw).not.toContain('plain-grant-token')
    expect(JSON.parse(raw)).toEqual({
      action: 'unlock-denied',
      groupId: 'primary',
      password: '[REDACTED]',
      recoveryKey: '[REDACTED]',
      nested: { grantToken: '[REDACTED]', safe: 'kept' },
    })
    await expect(mode(dir)).resolves.toBe(0o700)
    await expect(mode(join(dir, AUDIT_FILE))).resolves.toBe(0o600)
  })
})
