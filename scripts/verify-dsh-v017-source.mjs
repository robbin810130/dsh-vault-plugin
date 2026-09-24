import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export const DSH_VERSION = '0.1.7-rc.1'
export const DSH_COMMIT = '46a7f68b0922371ce7144b668b90e377d8e799f4'
export const DSH_TREE = '55a4a1b1e7df3324c3c2a7f6fa27e61fedbb7278'

export async function validateSource(root, manifest) {
  if (manifest?.version !== DSH_VERSION) throw new Error(`unexpected pinned DSH version: ${manifest?.version}`)
  if (manifest?.upstreamCommit !== DSH_COMMIT) throw new Error(`unexpected pinned DSH commit: ${manifest?.upstreamCommit}`)
  if (manifest?.upstreamTree !== DSH_TREE) throw new Error(`unexpected pinned DSH source tree: ${manifest?.upstreamTree}`)
  const packageJson = JSON.parse(await readFile(join(resolve(root), 'package.json'), 'utf8'))
  if (packageJson.version !== DSH_VERSION) throw new Error(`unexpected DSH source version: ${packageJson.version}`)
  if (!manifest.files || Object.keys(manifest.files).length === 0) throw new Error('missing pinned DSH source file hashes')
}

export async function verifyTargetFiles(root, files) {
  for (const [relativePath, expected] of Object.entries(files ?? {})) {
    const absolutePath = resolve(root, relativePath)
    if (!absolutePath.startsWith(`${resolve(root)}/`)) throw new Error(`invalid DSH source path: ${relativePath}`)
    const bytes = await readFile(absolutePath)
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== expected) throw new Error(`DSH source hash mismatch: ${relativePath}`)
  }
}

export async function verifySourceTree(root, expectedTree) {
  if (!/^[0-9a-f]{40}$/.test(expectedTree ?? '')) throw new Error('missing pinned DSH source tree')
  await exec('git', ['init', '-q'], { cwd: root })
  await exec('git', ['add', '-f', '--all'], { cwd: root })
  const { stdout } = await exec('git', ['write-tree'], { cwd: root })
  const actual = stdout.trim()
  if (actual !== expectedTree) throw new Error(`DSH source tree mismatch: expected ${expectedTree}, got ${actual}`)
}

export async function verifyGeneratedBundles(root, expectedBundles) {
  const mismatches = []
  for (const [relativePath, expected] of Object.entries(expectedBundles ?? {})) {
    const absolutePath = resolve(root, relativePath)
    if (!absolutePath.startsWith(`${resolve(root)}/`)) throw new Error(`invalid DSH bundle path: ${relativePath}`)
    const actual = createHash('sha256').update(await readFile(absolutePath)).digest('hex')
    if (actual !== expected) mismatches.push(`${relativePath}: expected ${expected}, got ${actual}`)
  }
  if (mismatches.length) throw new Error(`DSH generated bundle mismatches:\n${mismatches.join('\n')}`)
}
