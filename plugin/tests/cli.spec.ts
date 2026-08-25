import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createVerifier } from '../src/host/crypto/verifier.js'
import { isCliEntrypoint, runCli } from '../src/cli.js'
import { resolveStateDirectory } from '../src/config.js'
import { VaultStateRepository } from '../src/host/state/repository.js'
import type { VaultState } from '../src/host/state/model.js'

async function protectedState(groupId = 'group-1'): Promise<VaultState> {
  const now = '2026-08-25T00:00:00.000Z'
  return {
    schemaVersion: 1,
    revision: 7,
    groups: {
      [groupId]: {
        id: groupId,
        name: 'Work',
        password: await createVerifier('correct-password'),
        recovery: { ...(await createVerifier('recovery-key')), generatedAt: now },
        credentialVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
    },
    bindings: [
      { targetType: 'workspace', targetId: 'ws-1', mode: 'direct', passwordGroupId: groupId, createdAt: now, updatedAt: now },
      { targetType: 'session', targetId: 'session-direct', mode: 'direct', passwordGroupId: 'other-group', workspaceId: 'ws-1', createdAt: now, updatedAt: now },
      { targetType: 'session', targetId: 'session-inherit', mode: 'inherit', workspaceId: 'ws-1', createdAt: now, updatedAt: now },
    ],
  }
}

function lines(...values: string[]): AsyncIterable<string> {
  return (async function* () {
    for (const value of values) yield value
  })()
}

describe('dsh-vault emergency CLI', () => {
  it('recognizes the installed executable entrypoint', () => {
    expect(isCliEntrypoint(pathToFileURL('/tmp/plugin/lib/cli.js').href, '/tmp/plugin/lib/cli.js')).toBe(true)
  })

  it('executes main through an installed .bin symlink instead of silently exiting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-vault-cli-bin-'))
    try {
      const binDirectory = join(root, 'node_modules', '.bin')
      await mkdir(binDirectory, { recursive: true })
      const packageCli = join(dirname(fileURLToPath(import.meta.url)), '../lib/cli.js')
      const bin = join(binDirectory, 'dsh-vault')
      await symlink(packageCli, bin)

      const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
        const child = spawn(process.execPath, [bin, 'unsupported-command'], {
          env: { ...process.env, DSH_VAULT_STATE_DIR: join(root, 'state') },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
        child.on('close', (code) => resolve({ code, stdout, stderr }))
      })

      expect(result).toEqual({ code: 2, stdout: '', stderr: 'Vault operation failed.\n' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('requires the full group id before emergency removal', async () => {
    const state = await protectedState()
    const result = await runCli(['protection', 'remove', '--group', 'group-1'], {
      stdin: lines('wrong-id'),
      state,
    })

    expect(result.exitCode).toBe(2)
    expect(result.state).toEqual(state)
  })

  it('removes only matching protection bindings and appends sanitized audit', async () => {
    const state = await protectedState()
    const result = await runCli(['protection', 'remove', '--group', 'group-1'], {
      stdin: lines('group-1'),
      state,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Work')
    expect(result.output).toContain('1')
    expect(result.state?.bindings).toEqual([
      state.bindings[1],
      state.bindings[2],
    ])
    expect(result.audit).toEqual(expect.objectContaining({
      action: 'protection-removed',
      groupId: 'group-1',
      count: 1,
      result: 'success',
    }))
    expect(JSON.stringify({ output: result.output, audit: result.audit }))
      .not.toMatch(/verifier|password|recovery|token|path|stack/i)
  })

  it('leaves state unchanged when the pre-commit audit append fails', async () => {
    const state = await protectedState()
    let current = state
    let commits = 0
    const result = await runCli(['protection', 'remove', '--group', 'group-1'], {
      stdin: lines('group-1'),
      repository: {
        load: async () => current,
        commit: async () => {
          commits += 1
          current = { ...state, revision: state.revision + 1, bindings: [] }
          return { ok: true as const, revision: current.revision }
        },
        appendAudit: async () => { throw new Error('audit unavailable') },
      },
    })

    expect(result.exitCode).toBe(1)
    expect(current).toEqual(state)
    expect(commits).toBe(0)
  })

  it('records an attempt rather than a false success when the commit conflicts', async () => {
    const state = await protectedState()
    const audits: unknown[] = []
    const result = await runCli(['protection', 'remove', '--group', 'group-1'], {
      stdin: lines('group-1'),
      repository: {
        load: async () => state,
        commit: async () => ({ ok: false as const, code: 'revision-conflict' as const }),
        appendAudit: async (event) => { audits.push(event) },
      },
    })

    expect(result.exitCode).toBe(1)
    expect(audits).toEqual([expect.objectContaining({ action: 'protection-removal-attempt' })])
    expect(JSON.stringify(audits)).not.toContain('"result":"success"')
  })

  it('uses the absolute CLI flag over the environment and the same resolver as Host', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-vault-cli-state-'))
    try {
      const flagDirectory = join(root, 'flag-state')
      const envDirectory = join(root, 'env-state')
      await mkdir(flagDirectory, { recursive: true })
      const state = await protectedState()
      await writeFile(join(flagDirectory, 'state.json'), JSON.stringify(state))

      const result = await runCli([
        'protection', 'remove', '--group', 'group-1', '--state-dir', flagDirectory,
      ], {
        stdin: lines('group-1'),
        environment: { DSH_VAULT_STATE_DIR: envDirectory },
      })

      expect(result.exitCode).toBe(0)
      expect(await new VaultStateRepository(resolveStateDirectory(flagDirectory)).load()).toMatchObject({
        revision: 8,
        bindings: state.bindings.slice(1),
      })
      await expect(readFile(join(envDirectory, 'state.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('uses the canonical DSH_HOME state directory when no CLI flag or vault env is supplied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-vault-cli-dsh-home-'))
    try {
      const stateDirectory = join(root, 'dsh-home', 'vault-lock')
      await mkdir(stateDirectory, { recursive: true })
      const state = await protectedState()
      await writeFile(join(stateDirectory, 'state.json'), JSON.stringify(state))

      const result = await runCli(['protection', 'remove', '--group', 'group-1'], {
        stdin: lines('group-1'),
        environment: { DSH_HOME: join(root, 'dsh-home') },
      })

      expect(result.exitCode).toBe(0)
      expect(await new VaultStateRepository(stateDirectory).load()).toMatchObject({ revision: 8 })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
