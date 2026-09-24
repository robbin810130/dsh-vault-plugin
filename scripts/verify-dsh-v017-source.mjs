import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const DSH_VERSION = '0.1.7-rc.1'
export const DSH_COMMIT = '46a7f68b0922371ce7144b668b90e377d8e799f4'

export async function validateSource(root, manifest) {
  if (manifest?.version !== DSH_VERSION) throw new Error(`unexpected pinned DSH version: ${manifest?.version}`)
  if (manifest?.upstreamCommit !== DSH_COMMIT) throw new Error(`unexpected pinned DSH commit: ${manifest?.commit}`)
  const packageJson = JSON.parse(await readFile(join(resolve(root), 'package.json'), 'utf8'))
  if (packageJson.version !== DSH_VERSION) throw new Error(`unexpected DSH source version: ${packageJson.version}`)
  if (!manifest.sourceArchiveSHA256 || !/^[a-f0-9]{64}$/.test(manifest.sourceArchiveSHA256)) {
    throw new Error('missing valid DSH source archive SHA-256')
  }
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

export async function verifySourceArchive(archivePath, expectedHash) {
  const actual = createHash('sha256').update(await readFile(archivePath)).digest('hex')
  if (actual !== expectedHash) throw new Error(`DSH source archive hash mismatch: ${actual}`)
}
