import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const artifacts = join(root, 'artifacts')
const expected = 'dsh-vault-plugin.tgz'

// Marketplace wrapper guard: the repo-root package.json is what dsh-plugin.org
// crawls and what `pnpm add github:owner/repo` installs. It must mirror the
// real plugin manifest under plugin/ — fail the release if they drift apart.
const pluginManifest = JSON.parse(readFileSync(join(root, 'plugin/package.json'), 'utf8'))
const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const key of ['name', 'version']) {
  if (rootManifest[key] !== pluginManifest[key]) {
    throw new Error(`root package.json ${key} (${rootManifest[key]}) != plugin/package.json (${pluginManifest[key]})`)
  }
}
const patchEntry = rootManifest.dsh?.bundle?.patch
if (typeof patchEntry !== 'string' || !existsSync(join(root, patchEntry))) {
  throw new Error(`root package.json dsh.bundle.patch (${patchEntry}) does not resolve to a file`)
}

rmSync(artifacts, { recursive: true, force: true })
mkdirSync(artifacts, { recursive: true })
execFileSync('pnpm', ['--dir', 'plugin', 'run', 'build'], { cwd: root, stdio: 'inherit' })
execFileSync('pnpm', ['--dir', 'plugin', 'pack', '--pack-destination', '../artifacts'], { cwd: root, stdio: 'inherit' })

const packed = readdirSync(artifacts).find(name => name.endsWith('.tgz'))
if (packed === undefined) throw new Error('Plugin package was not produced')
const source = join(artifacts, packed)
const target = join(artifacts, expected)
if (source !== target) renameSync(source, target)

const checksum = createHash('sha256').update(readFileSync(target)).digest('hex')
writeFileSync(`${target}.sha256`, `${checksum}  ${expected}\n`)
console.log(`artifact: ${target}`)
console.log(`checksum: ${target}.sha256`)
console.log(`sha256: ${checksum}`)
