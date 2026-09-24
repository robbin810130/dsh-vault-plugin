import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { validateSource, verifySourceArchive, verifyTargetFiles } from '../../scripts/verify-dsh-v017-source.mjs'

const roots = []

async function sourceFixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-v017-'))
  roots.push(root)
  await mkdir(join(root, 'packages/client/ui-workspace/src/client'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.1.7-rc.1' }))
  await writeFile(join(root, 'packages/client/ui-workspace/src/client/navigation.ts'), 'export const navigation = true\n')
  const content = await readFile(join(root, 'packages/client/ui-workspace/src/client/navigation.ts'))
  return {
    root,
    manifest: {
      version: '0.1.7-rc.1',
      upstreamCommit: '46a7f68b0922371ce7144b668b90e377d8e799f4',
      sourceArchiveSHA256: 'a'.repeat(64),
      files: { 'packages/client/ui-workspace/src/client/navigation.ts': await import('node:crypto').then(({ createHash }) => createHash('sha256').update(content).digest('hex')) },
    },
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

test('accepts only the pinned DSH version and verified source files', async () => {
  const fixture = await sourceFixture()
  await assert.doesNotReject(validateSource(fixture.root, fixture.manifest))
  await assert.doesNotReject(verifyTargetFiles(fixture.root, fixture.manifest.files))
})

test('rejects a different DSH version or commit', async () => {
  const fixture = await sourceFixture()
  await assert.rejects(validateSource(fixture.root, { ...fixture.manifest, version: '0.1.8' }), /version/)
  await assert.rejects(validateSource(fixture.root, { ...fixture.manifest, upstreamCommit: 'wrong' }), /commit/)
})

test('rejects source bundle drift before applying a compatibility patch', async () => {
  const fixture = await sourceFixture()
  await writeFile(join(fixture.root, 'packages/client/ui-workspace/src/client/navigation.ts'), 'changed\n')
  await assert.rejects(verifyTargetFiles(fixture.root, fixture.manifest.files), /hash mismatch/)
})

test('accepts only the byte-identical pinned source archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-v017-archive-'))
  roots.push(root)
  const archive = join(root, 'upstream.tar.gz')
  const bytes = Buffer.from('official source archive fixture')
  await writeFile(archive, bytes)
  const hash = createHash('sha256').update(bytes).digest('hex')
  await assert.doesNotReject(verifySourceArchive(archive, hash))
  await assert.rejects(verifySourceArchive(archive, '0'.repeat(64)), /archive hash mismatch/)
})
