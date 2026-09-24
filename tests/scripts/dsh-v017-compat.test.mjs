import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { normalizeBundleSourcePaths, validateSource, verifyGeneratedBundles, verifySourceTree, verifyTargetFiles } from '../../scripts/verify-dsh-v017-source.mjs'

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
      upstreamTree: '55a4a1b1e7df3324c3c2a7f6fa27e61fedbb7278',
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
  await assert.rejects(validateSource(fixture.root, { ...fixture.manifest, upstreamTree: 'wrong' }), /tree/)
})

test('rejects source bundle drift before applying a compatibility patch', async () => {
  const fixture = await sourceFixture()
  await writeFile(join(fixture.root, 'packages/client/ui-workspace/src/client/navigation.ts'), 'changed\n')
  await assert.rejects(verifyTargetFiles(fixture.root, fixture.manifest.files), /hash mismatch/)
})

test('rejects a source archive whose complete Git tree differs from the pinned upstream tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-v017-tree-'))
  roots.push(root)
  await writeFile(join(root, 'a.txt'), 'a\n')
  const pinnedTree = '08585692ce06452da6f82ae66b90d98b55536fca'
  await assert.doesNotReject(verifySourceTree(root, pinnedTree))
  await writeFile(join(root, 'unexpected.txt'), 'drift\n')
  await assert.rejects(verifySourceTree(root, pinnedTree), /source tree mismatch/)
})

test('accepts only the reviewed generated browser bundle bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-v017-bundles-'))
  roots.push(root)
  const bundle = 'packages/client/ui-workspace/lib/client.js'
  await mkdir(join(root, 'packages/client/ui-workspace/lib'), { recursive: true })
  await writeFile(join(root, bundle), 'export const patched = true\n')
  const expected = createHash('sha256').update('export const patched = true\n').digest('hex')
  await assert.doesNotReject(verifyGeneratedBundles(root, { [bundle]: expected }))
  await writeFile(join(root, bundle), 'export const patched = false\n')
  await assert.rejects(verifyGeneratedBundles(root, { [bundle]: expected }), /generated bundle mismatch/)
})

test('normalizes temporary source roots embedded in generated browser bundles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-v017-normalize-'))
  roots.push(root)
  const bundle = 'client.js'
  const sourceRoot = '/tmp/dsh-v017-compat-random/source'
  await writeFile(join(root, bundle), `//#region ${sourceRoot}/packages/client/ui-workspace/src/client/index.ts`)
  await normalizeBundleSourcePaths(root, sourceRoot, [bundle])
  assert.equal(await readFile(join(root, bundle), 'utf8'), '//#region /dsh-source/packages/client/ui-workspace/src/client/index.ts')
})
