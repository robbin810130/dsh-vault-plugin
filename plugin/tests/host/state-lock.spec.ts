import * as fs from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { VaultStateRepository } from '../../src/host/state/repository.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })
async function directory() { const root = await fs.mkdtemp(join(tmpdir(), 'vault-lock-regression-')); roots.push(root); return root }
async function deadPid() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
  await once(child, 'spawn')
  const pid = child.pid!
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await exited
  return pid
}
function owner(pid: number, token = 'test-owner-unique') { return JSON.stringify({ version: 1, pid, hostname: hostname(), token }) }

it('recovers a confirmed dead local owner and serializes concurrent reclaimers', async () => {
  const root = await directory()
  await fs.writeFile(join(root, 'state.lock'), owner(await deadPid()))
  const results = await Promise.all(Array.from({ length: 8 }, () => new VaultStateRepository(root).load()))
  expect(results.map(state => state.revision)).toEqual(Array(8).fill(0))
  await expect(fs.readFile(join(root, 'state.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('does not reclaim a live owner even when its lock timestamp is old', async () => {
  const root = await directory()
  const record = owner(process.pid)
  await fs.writeFile(join(root, 'state.lock'), record)
  await fs.utimes(join(root, 'state.lock'), new Date(0), new Date(0))
  await expect(new VaultStateRepository(root).load()).rejects.toMatchObject({ code: 'state-lock-busy' })
  expect(await fs.readFile(join(root, 'state.lock'), 'utf8')).toBe(record)
})

it.each(['', 'not-json', JSON.stringify({ version: 1, pid: 0, hostname: hostname(), token: 'invalid' }), JSON.stringify({ version: 1, pid: 99999, hostname: 'another-host', token: 'foreign' })])('refuses unknown ownership without deleting evidence: %s', async record => {
  const root = await directory()
  await fs.writeFile(join(root, 'state.lock'), record)
  await expect(new VaultStateRepository(root).load()).rejects.toMatchObject({ code: 'state-lock-recovery-required' })
  expect(await fs.readFile(join(root, 'state.lock'), 'utf8')).toBe(record)
})

it('publishes a complete owner record before entering the state operation', async () => {
  const root = await directory()
  let observed: Record<string, unknown> | undefined
  const repo = new VaultStateRepository(root, { ...fs, readdir: async path => {
    observed = JSON.parse(await fs.readFile(join(root, 'state.lock'), 'utf8'))
    return fs.readdir(path)
  } })
  await repo.load()
  expect(observed).toMatchObject({ version: 1, pid: process.pid, hostname: hostname() })
  expect(observed?.token).toEqual(expect.any(String))
})

it('recovers after SIGKILL interrupts a real repository critical section', async () => {
  const root = await directory()
  await new VaultStateRepository(root).load()
  const modulePath = fileURLToPath(new URL('../../src/host/state/repository.ts', import.meta.url))
  const code = `import * as fs from 'node:fs/promises'; import { VaultStateRepository } from ${JSON.stringify(modulePath)};
    const repo = new VaultStateRepository(${JSON.stringify(root)}, { ...fs, readdir: async path => {
      process.stdout.write('LOCKED'); await new Promise(() => { setInterval(() => {}, 1000) }); return [];
    } }); await repo.load();`
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout.once('data', () => resolve())
      child.once('exit', () => reject(new Error('child exited before acquiring lock')))
      child.once('error', reject)
    })
    const persisted = JSON.parse(await fs.readFile(join(root, 'state.lock'), 'utf8'))
    expect(persisted.pid).toBe(child.pid)
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
    expect((await new VaultStateRepository(root).load()).revision).toBe(0)
  } finally { child.kill('SIGKILL') }
})
