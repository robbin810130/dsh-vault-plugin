import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { createVerifier } from '../src/host/crypto/verifier.js'
import { isCliEntrypoint, runCli } from '../src/cli.js'
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
})
