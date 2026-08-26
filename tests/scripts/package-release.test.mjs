import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const artifact = join(root, 'artifacts', 'dsh-vault-plugin.tgz')
const checksum = `${artifact}.sha256`

test('release package contains only declared install assets', () => {
  assert.equal(existsSync(artifact), true)
  const listing = execFileSync('tar', ['-tzf', artifact], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean).map(entry => entry.replace(/^package\//, ''))
  const forbidden = listing.filter(entry => /(^|\/)(src|tests|node_modules|dist)|(^|\/)\.env|vault-lock|token/i.test(entry))
  assert.deepEqual(forbidden, [])
  for (const expected of ['package.json', 'README.md', 'LICENSE', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/cli.js']) {
    assert.equal(listing.includes(expected), true, expected)
  }
})

test('release package emits a reproducible checksum sidecar', () => {
  assert.equal(existsSync(checksum), true)
  const digest = createHash('sha256').update(readFileSync(artifact)).digest('hex')
  assert.equal(readFileSync(checksum, 'utf8'), `${digest}  dsh-vault-plugin.tgz\n`)
})

test('release package exposes package.json to the DSH client roster scanner', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsh-vault-release-'))
  const packageRoot = join(temp, 'profile', 'node_modules', '@robbin810130', 'dsh-vault-plugin')
  mkdirSync(packageRoot, { recursive: true })
  try {
    execFileSync('tar', ['-xzf', artifact, '-C', packageRoot, '--strip-components=1'])
    const require = createRequire(pathToFileURL(join(temp, 'profile', 'cordis.yml')))
    assert.equal(
      require.resolve('@robbin810130/dsh-vault-plugin/package.json'),
      realpathSync(join(packageRoot, 'package.json')),
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
