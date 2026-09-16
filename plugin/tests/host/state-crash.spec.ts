import * as fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { VaultStateRepository } from '../../src/host/state/repository.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })
const stateAt = (revision: number) => ({ schemaVersion: 1 as const, revision, groups: {}, bindings: [] })

async function killAtCheckpoint(root: string, checkpoint: string): Promise<void> {
  const modulePath = fileURLToPath(new URL('../../src/host/state/repository.ts', import.meta.url))
  const code = `import * as fs from 'node:fs/promises'; import { VaultStateRepository } from ${JSON.stringify(modulePath)};
    const root = ${JSON.stringify(root)}, checkpoint = ${JSON.stringify(checkpoint)};
    let backupPublished = false, failed = false;
    const pause = async () => { process.stdout.write('CHECKPOINT'); await new Promise(() => setInterval(() => {}, 1000)); };
    const io = { ...fs,
      link: async (source, destination) => {
        await fs.link(source, destination);
        if (destination === root + '/state.recovery.json' && checkpoint === 'record-published') await pause();
      },
      unlink: async path => {
        await fs.unlink(path);
        if (path === root + '/state.recovery.json' && checkpoint === 'commit-point') await pause();
      },
      rename: async (source, destination) => {
        await fs.rename(source, destination);
        if (destination === root + '/state.json.bak') backupPublished = true;
        if (destination === root + '/state.json' && checkpoint === 'state-published') await pause();
        if (destination === root + '/state.json' && checkpoint === 'recovery-interrupted') await pause();
      },
      open: async (path, flags, mode) => {
        const h = await fs.open(path, flags, mode);
        return { writeFile: data => h.writeFile(data), close: () => h.close(), sync: async () => {
          if (path === root && backupPublished && !failed && checkpoint !== 'commit-point') { failed = true; throw new Error('injected post-backup fsync failure'); }
          await h.sync();
          if (failed && path === root + '/state.json' && flags === 'r+' && checkpoint === 'primary-rolled-back') await pause();
          if (failed && path === root && checkpoint === 'primary-rolled-back' && JSON.parse(await fs.readFile(root + '/state.json', 'utf8')).revision === 1) await pause();
        } };
      }
    };
    const repo = new VaultStateRepository(root, io);
    if (checkpoint === 'recovery-interrupted') await repo.load();
    else await repo.commit(1, ${JSON.stringify(stateAt(2))});`
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  let stderr = ''
  child.stderr.on('data', data => { stderr += String(data) })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`checkpoint timed out: ${stderr}`)), 5000)
      let stdout = ''
      child.stdout.on('data', data => {
        stdout += String(data)
        if (stdout.includes('CHECKPOINT')) { clearTimeout(timer); resolve() }
      })
      child.once('exit', () => { clearTimeout(timer); reject(new Error(`early exit: ${stderr}`)) })
      child.once('error', error => { clearTimeout(timer); reject(error) })
    })
  } finally {
    child.kill('SIGKILL')
    await exited
  }
}

it.each(['primary-rolled-back', 'state-published', 'recovery-interrupted', 'without-backup', 'record-published'])('restores both original generations after SIGKILL at %s', async checkpoint => {
  const root = await fs.mkdtemp(join(tmpdir(), 'vault-state-crash-'))
  roots.push(root)
  const repo = new VaultStateRepository(root)
  await repo.load()
  await repo.commit(0, stateAt(1))
  if (checkpoint === 'without-backup') await fs.unlink(join(root, 'state.json.bak'))
  const originalState = await fs.readFile(join(root, 'state.json'), 'utf8')
  const originalBackup = checkpoint === 'without-backup' ? undefined : await fs.readFile(join(root, 'state.json.bak'), 'utf8')
  await killAtCheckpoint(root, checkpoint === 'recovery-interrupted' ? 'state-published' : checkpoint === 'without-backup' ? 'primary-rolled-back' : checkpoint)
  if (checkpoint === 'recovery-interrupted') await killAtCheckpoint(root, checkpoint)
  await new VaultStateRepository(root).load()
  expect(await fs.readFile(join(root, 'state.json'), 'utf8')).toBe(originalState)
  if (originalBackup === undefined) await expect(fs.access(join(root, 'state.json.bak'))).rejects.toMatchObject({ code: 'ENOENT' })
  else expect(await fs.readFile(join(root, 'state.json.bak'), 'utf8')).toBe(originalBackup)
  await expect(fs.access(join(root, 'state.recovery.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await fs.readdir(root)).filter(name => name.includes('.tmp-'))).toEqual([])
})

it('does not undo a committed pair after SIGKILL past the commit point', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'vault-state-crash-'))
  roots.push(root)
  const repo = new VaultStateRepository(root)
  await repo.load()
  await repo.commit(0, stateAt(1))
  await killAtCheckpoint(root, 'commit-point')
  expect((await new VaultStateRepository(root).load()).revision).toBe(2)
  expect(JSON.parse(await fs.readFile(join(root, 'state.json.bak'), 'utf8')).revision).toBe(1)
})

it('retains the undo record on recovery failure and recovers before stale cleanup', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'vault-state-crash-'))
  roots.push(root)
  const repo = new VaultStateRepository(root)
  await repo.load()
  await repo.commit(0, stateAt(1))
  await killAtCheckpoint(root, 'state-published')
  const record = await fs.readFile(join(root, 'state.recovery.json'), 'utf8')
  expect((await fs.stat(join(root, 'state.recovery.json'))).mode & 0o777).toBe(0o600)
  let cleanupCalled = false
  const failing = new VaultStateRepository(root, { ...fs,
    readdir: async path => { cleanupCalled = true; return fs.readdir(path) },
    rename: async () => { throw new Error('recovery rename failure') },
  })
  await expect(failing.load()).rejects.toThrow('recovery rename failure')
  expect(cleanupCalled).toBe(false)
  expect(await fs.readFile(join(root, 'state.recovery.json'), 'utf8')).toBe(record)
  expect((await new VaultStateRepository(root).load()).revision).toBe(1)
  expect(JSON.parse(await fs.readFile(join(root, 'state.json.bak'), 'utf8')).revision).toBe(0)
})

it('fails closed on a malformed recovery record without removing evidence', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'vault-state-crash-'))
  roots.push(root)
  const repo = new VaultStateRepository(root)
  await repo.load()
  await fs.writeFile(join(root, 'state.recovery.json'), '{broken')
  await fs.writeFile(join(root, '.state.json.tmp-evidence'), 'evidence')
  await expect(repo.load()).rejects.toThrow('explicit recovery is required')
  expect(await fs.readFile(join(root, 'state.recovery.json'), 'utf8')).toBe('{broken')
  expect(await fs.readFile(join(root, '.state.json.tmp-evidence'), 'utf8')).toBe('evidence')
  expect(JSON.parse(await fs.readFile(join(root, 'state.json'), 'utf8')).revision).toBe(0)
})
