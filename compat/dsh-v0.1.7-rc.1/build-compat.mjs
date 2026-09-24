import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { normalizeBundleSourcePaths, validateSource, verifyGeneratedBundles, verifySourceTree, verifyTargetFiles } from '../../scripts/verify-dsh-v017-source.mjs'

const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const compatDir = join(root, 'compat/dsh-v0.1.7-rc.1')
const manifest = JSON.parse(await readFile(join(compatDir, 'source.json'), 'utf8'))
const patchPath = join(compatDir, '0001-plugin-access-seams.patch')
const builderPath = join(compatDir, 'build-vault-client.mts')
const outputPath = resolve(process.argv[2] ?? join(root, '.cache/dsh-v017-patched'))
const archivePath = resolve(process.argv[3] ?? join(root, '.cache/dsh-v0.1.7-rc.1-source.tar.gz'))

async function run(command, args, cwd) {
  await exec(command, args, { cwd, maxBuffer: 32 * 1024 * 1024 })
}

async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

const baseline = JSON.parse(await readFile(join(compatDir, 'verification.json'), 'utf8'))
const patchHash = await hashFile(patchPath)
if (patchHash !== manifest.patchSHA256) throw new Error(`DSH patch hash mismatch: ${patchHash}`)

const staging = await mkdtemp(join(tmpdir(), 'dsh-v017-compat-'))
const source = join(staging, 'source')
try {
  await mkdir(source)
  await run('tar', ['-xzf', archivePath, '--strip-components=1', '-C', source], staging)
  await verifySourceTree(source, manifest.upstreamTree)
  await validateSource(source, manifest)
  await verifyTargetFiles(source, manifest.files)
  await run('git', ['apply', '--check', patchPath], source)
  await run('git', ['apply', patchPath], source)
  await cp(builderPath, join(source, 'build-vault-client.mts'))
  await run('pnpm', ['install', '--frozen-lockfile'], source)
  await run('pnpm', ['exec', 'vitest', 'run', 'packages/client/ui-workspace/tests/workspace-row-actions.client.spec.tsx'], source)
  await run('pnpm', ['run', 'build:lib:host'], source)
  await run('pnpm', ['exec', 'tsx', 'build-vault-client.mts'], source)

  const bundles = [
    'packages/api/session-controller/lib/client.js',
    'packages/api/session-controller/lib/client.js.map',
    'packages/client/ui-workspace/lib/client.js',
    'packages/client/ui-workspace/lib/client.js.map',
    'packages/client/ui-layout/lib/client.js',
    'packages/client/ui-layout/lib/client.js.map',
    'packages/client/ui-conversation/lib/client.js',
    'packages/client/ui-conversation/lib/client.js.map',
  ]
  await normalizeBundleSourcePaths(source, source, bundles.filter(path => path.endsWith('.js')))
  for (const relativePath of bundles) {
    const destination = join(outputPath, relativePath)
    await mkdir(dirname(destination), { recursive: true })
    await cp(join(source, relativePath), destination)
  }
  await verifyGeneratedBundles(source, baseline.bundles)
  const record = {
    date: new Date().toISOString(),
    version: manifest.version,
    upstreamCommit: manifest.upstreamCommit,
    upstreamTree: manifest.upstreamTree,
    patchSHA256: patchHash,
    bundles: Object.fromEntries(await Promise.all(bundles.map(async path => [path, await hashFile(join(outputPath, path))]))),
  }
  await writeFile(join(outputPath, 'verification.json'), `${JSON.stringify(record, null, 2)}\n`)
  console.log(`verified DSH ${manifest.version} patch build at ${outputPath}`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
