import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base } from 'playwright/test'

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url))
const dshRoot = join(projectRoot, '.cache', 'deepseek-harness-e2e')
const cliPath = join(dshRoot, 'apps', 'cli', 'lib', 'bin.js')
const artifactPath = join(projectRoot, 'artifacts', 'dsh-vault-plugin-0.1.0.tgz')

export interface DshVaultFixture {
  readonly origin: string
  readonly home: string
  seedLockedSession(input: { title: string }): Promise<{ id: string; title: string }>
  restart(): Promise<void>
}

interface CommandResult {
  readonly stdout: string
  readonly stderr: string
}

function runNode(args: readonly string[], cwd: string, environment: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`node ${args.join(' ')} exited ${String(code)}\n${stdout}${stderr}`))
    })
  })
}

async function postJson(origin: string, pathname: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${origin}${pathname}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(pathname === '/dsh-vault/api'
      ? payload
      : {
          type: 'client-request',
          rpcId: `vault-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          method: payload.method,
          payload: payload.payload,
        }),
  })
  if (!response.ok) throw new Error(`${pathname} failed over HTTP ${response.status}: ${await response.text()}`)
  const body = await response.json() as any
  if (pathname === '/dsh-vault/api') {
    if (!body.ok) throw new Error(`Vault fixture request failed: ${body.error?.code ?? 'unknown'}`)
    return body.value
  }
  if (!body.result?.ok) throw new Error(`DSH fixture request failed: ${body.result?.error?.code ?? 'unknown'}`)
  return body.result.value
}

function waitForOrigin(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => {
      reject(new Error(`DSH web did not announce an origin\n${output}`))
    }, 30_000)
    const inspect = (chunk: string | Buffer): void => {
      output += chunk.toString()
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
      if (match?.[1] === undefined) return
      clearTimeout(timeout)
      resolve(match[1])
    }
    child.stdout?.on('data', inspect)
    child.stderr?.on('data', inspect)
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`DSH web exited before readiness with ${String(code)}\n${output}`))
    })
  })
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

export const test = base.extend<{ dsh: DshVaultFixture }>({
  dsh: async ({}, use) => {
    await runNode([join(projectRoot, 'scripts', 'package-release.mjs')], projectRoot)
    await access(artifactPath)
    const home = await mkdtemp(join(tmpdir(), 'dsh-vault-playwright-'))
    let server: ChildProcess | undefined
    try {
      await runNode([cliPath, 'plugin', '--profile', 'web', 'add', artifactPath], projectRoot, { DSH_HOME: home })
      const start = async (port: string): Promise<string> => {
        server = spawn(process.execPath, [cliPath, 'web', '--host', '127.0.0.1', '--port', port, '--no-open'], {
          cwd: dshRoot,
          env: { ...process.env, DSH_HOME: home },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        return await waitForOrigin(server)
      }
      const origin = await start('0')
      const port = new URL(origin).port
      await use({
        origin,
        home,
        seedLockedSession: async ({ title }) => {
          const created = await postJson(origin, '/api/session.create', { method: 'session.create', payload: {} }) as { sessionId: string }
          await postJson(origin, '/api/session.rename', { method: 'session.rename', payload: { sessionId: created.sessionId, title } })
          const clientInstanceId = `vault-seed-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const password = `Seed!${Math.random().toString(36).slice(2)}Aa9`
          const group = await postJson(origin, '/dsh-vault/api', {
            action: 'group-create', clientInstanceId, expectedRevision: 0, grants: [],
            input: { name: `Seed ${title}`, password, bindings: [] },
          }) as { snapshot: { groups: readonly { id: string }[] } }
          const groupId = group.snapshot.groups[0]?.id
          if (groupId === undefined) throw new Error('Vault fixture group was not created')
          const unlocked = await postJson(origin, '/dsh-vault/api', {
            action: 'unlock', clientInstanceId, groupId, password,
          }) as { grant: { groupId: string; credentialVersion: number; token: string } }
          const now = new Date().toISOString()
          await postJson(origin, '/dsh-vault/api', {
            action: 'bindings-update', clientInstanceId, expectedRevision: 1, grants: [unlocked.grant],
            input: { kind: 'replace', binding: {
              targetType: 'session', targetId: created.sessionId, mode: 'direct',
              passwordGroupId: groupId, createdAt: now, updatedAt: now,
            } },
          })
          return { id: created.sessionId, title }
        },
        restart: async () => {
          if (server !== undefined) await stop(server)
          await start(port)
        },
      })
    } finally {
      if (server !== undefined) await stop(server)
      await rm(home, { recursive: true, force: true })
    }
  },
})

export { expect } from 'playwright/test'
