#!/usr/bin/env node

import { createInterface } from 'node:readline'
import { realpathSync } from 'node:fs'
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
  commitWithAudit?(
    expectedRevision: number,
    next: VaultState,
    attempt: AuditEvent,
    success: AuditEvent,
  ): Promise<{ ok: true; revision: number } | { ok: false; code: 'revision-conflict' }>
}

interface ParsedCliArguments {
  readonly groupId: string
  readonly stateDir?: string
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

  async commitWithAudit(
    expectedRevision: number,
    next: VaultState,
    attempt: AuditEvent,
    success: AuditEvent,
  ): Promise<{ ok: true; revision: number } | { ok: false; code: 'revision-conflict' }> {
    this.audit = attempt
    if (this.state.revision !== expectedRevision) return { ok: false, code: 'revision-conflict' }
    const previous = this.state
    this.state = next
    try {
      this.audit = success
    } catch (error) {
      this.state = previous
      throw error
    }
    return { ok: true, revision: next.revision }
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
  return parseArguments(argv)?.groupId
}

function parseArguments(argv: readonly string[]): ParsedCliArguments | undefined {
  if (argv[0] !== 'protection' || argv[1] !== 'remove') return undefined
  let groupId: string | undefined
  let stateDir: string | undefined
  for (let index = 2; index < argv.length; index += 1) {
    const option = argv[index]
    const value = argv[index + 1]
    if ((option === '--group' || option === '--state-dir') && (value === undefined || value.startsWith('--'))) return undefined
    if (option === '--group' && groupId === undefined) {
      groupId = value
      index += 1
      continue
    }
    if (option === '--state-dir' && stateDir === undefined) {
      stateDir = value
      index += 1
      continue
    }
    return undefined
  }
  return groupId === undefined || groupId.length === 0 ? undefined : { groupId, ...(stateDir === undefined ? {} : { stateDir }) }
}

function failure(exitCode: 1 | 2, output = ''): CliResult {
  return { exitCode, output, error: 'Vault operation failed.\n' }
}

export function isCliEntrypoint(moduleUrl: string, argv1 = process.argv[1]): boolean {
  if (argv1 === undefined) return false
  const modulePath = fileURLToPath(moduleUrl)
  try {
    return realpathSync(modulePath) === realpathSync(argv1)
  } catch {
    return resolve(modulePath) === resolve(argv1)
  }
}

export async function runCli(argv: readonly string[], options: CliInputOptions = {}): Promise<CliResult> {
  try {
    const parsed = parseArguments(argv)
    const groupId = parsed?.groupId ?? parseGroupId(argv)
    if (groupId === undefined) return failure(2)
    const memoryRepository = options.state === undefined ? undefined : new MemoryRepository(options.state)
    const repository = options.repository
      ?? memoryRepository
      ?? new VaultStateRepository(resolveStateDirectory(parsed?.stateDir ?? options.stateDir, options.environment))
    const now = options.now ?? (() => new Date().toISOString())
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

    const attemptAudit: AuditEvent = {
      timestamp: now(),
      action: 'protection-removal-attempt',
      groupId,
      count: memberCount,
      reasonCode: 'pending-commit',
    }
    const next: VaultState = {
      ...state,
      revision: state.revision + 1,
      bindings: state.bindings.filter((binding) => binding.passwordGroupId !== groupId),
    }
    const audit: AuditEvent = {
      timestamp: now(),
      action: 'protection-removed',
      groupId,
      count: memberCount,
      revision: next.revision,
      result: 'success',
    }
    if (repository.commitWithAudit === undefined) {
      await repository.appendAudit(attemptAudit)
      return failure(1, output)
    }
    const auditedCommit = await repository.commitWithAudit(state.revision, next, attemptAudit, audit)
    if (!auditedCommit.ok) {
      const result = failure(1, output)
      return memoryRepository === undefined ? result : { ...result, state: memoryRepository.state }
    }
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
