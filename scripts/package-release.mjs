import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const artifacts = join(root, 'artifacts')
const expected = 'dsh-vault-plugin.tgz'

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
