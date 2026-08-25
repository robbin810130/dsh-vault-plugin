#!/usr/bin/env node

import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { resolveStateDirectory } from './config.js'
import type { AuditEvent, VaultState } from './host/state/model.js'
import { VaultStateRepository } from './host/state/repository.js'

interface CliRepository {
  load(): Promise<VaultState>
  commit(expectedRevision: number, next: VaultState): Promise<{ ok: true; revision: number } | { ok: false; code: 'revision-conflict' }>
  appendAudit(event: AuditEvent): Promise<void>
}

interface CliInputOptions {
  readonly stdin?: AsyncIterable<string> | Readable
  readonly state?: VaultState
  readonly repository?: CliRepository
  readonly stateDir?: string
  readonly environment?: NodeJS.ProcessEnv
  readonly workingDirectory?: string
  readonly now?: () => string
}

export interface CliResult {
  readonly exitCode: 0 | 1 | 2
  readonly output: string
  readonly error: string
  readonly state?: VaultState
  readonly audit?: AuditEvent
}

class MemoryRepository implements CliRepository {
  state: VaultState
  audit?: AuditEvent

  constructor(state: VaultState) {
    this.state = state
  }

  async load(): Promise<VaultState> {
    return this.state
  }

  async commit(expectedRevision: number, next: VaultState): Promise<{ ok: true; revision: number } | { ok: false; code: 'revision-conflict' }> {
    if (this.state.revision !== expectedRevision) return { ok: false, code: 'revision-conflict' }
    this.state = next
    return { ok: true, revision: next.revision }
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    this.audit = event
  }
}

async function firstInputLine(input: CliInputOptions['stdin']): Promise<string | undefined> {
  if (input !== undefined && Symbol.asyncIterator in Object(input)) {
    const iterator = (input as AsyncIterable<string>)[Symbol.asyncIterator]()
    const next = await iterator.next()
    return next.done ? undefined : String(next.value).trim()
  }

  const source = input as Readable | undefined
  if (source === undefined) return undefined
  const reader = createInterface({ input: source })
  try {
    for await (const line of reader) return line.trim()
    return undefined
  } finally {
    reader.close()
  }
}

function parseGroupId(argv: readonly string[]): string | undefined {
  if (argv.length !== 4 || argv[0] !== 'protection' || argv[1] !== 'remove' || argv[2] !== '--group') return undefined
  const groupId = argv[3]
  return groupId === undefined || groupId.length === 0 ? undefined : groupId
}

function failure(exitCode: 1 | 2, output = ''): CliResult {
  return { exitCode, output, error: 'Vault operation failed.\n' }
}

export function isCliEntrypoint(moduleUrl: string, argv1 = process.argv[1]): boolean {
  return argv1 !== undefined && resolve(fileURLToPath(moduleUrl)) === resolve(argv1)
}

export async function runCli(argv: readonly string[], options: CliInputOptions = {}): Promise<CliResult> {
  const groupId = parseGroupId(argv)
  if (groupId === undefined) return failure(2)

  const memoryRepository = options.state === undefined ? undefined : new MemoryRepository(options.state)
  const repository = options.repository
    ?? memoryRepository
    ?? new VaultStateRepository(resolveStateDirectory(options.stateDir, options.environment, options.workingDirectory))
  const now = options.now ?? (() => new Date().toISOString())

  try {
    const state = await repository.load()
    const group = state.groups[groupId]
    if (group === undefined) {
      const result = failure(2)
      return memoryRepository === undefined ? result : { ...result, state: memoryRepository.state }
    }
    const memberCount = state.bindings.filter((binding) => binding.passwordGroupId === groupId).length
    const output = 'Group: ' + group.name + '\nMembers: ' + memberCount + '\nType the full group ID to confirm: '
    const confirmation = await firstInputLine(options.stdin ?? process.stdin)
    if (confirmation !== groupId) {
      const result = failure(2, output)
      return memoryRepository === undefined ? result : { ...result, state: memoryRepository.state }
    }

    const next: VaultState = {
      ...state,
      revision: state.revision + 1,
      bindings: state.bindings.filter((binding) => binding.passwordGroupId !== groupId),
    }
    const committed = await repository.commit(state.revision, next)
    if (!committed.ok) {
      const result = failure(1, output)
      return memoryRepository === undefined ? result : { ...result, state: memoryRepository.state }
    }

    const audit: AuditEvent = {
      timestamp: now(),
      action: 'protection-removed',
      groupId,
      count: memberCount,
      revision: committed.revision,
      result: 'success',
    }
    await repository.appendAudit(audit)
    const finalOutput = output + '\nProtection removed.\n'
    return {
      exitCode: 0,
      output: finalOutput,
      error: '',
      ...(memoryRepository === undefined ? {} : { state: memoryRepository.state, audit: memoryRepository.audit }),
    }
  } catch {
    return failure(1)
  }
}

export async function main(argv = process.argv.slice(2), stdout: Writable = process.stdout, stderr: Writable = process.stderr): Promise<number> {
  const result = await runCli(argv)
  if (result.output) stdout.write(result.output)
  if (result.error) stderr.write(result.error)
  return result.exitCode
}

if (isCliEntrypoint(import.meta.url)) {
  main().then((exitCode) => { process.exitCode = exitCode })
}
