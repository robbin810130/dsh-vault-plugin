import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const artifact = join(root, 'artifacts', 'dsh-vault-plugin-0.1.0.tgz')

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
