import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
test('package manifests and bundle resolve the unscoped identity, preserving the state node', () => {
  for (const path of ['package.json', 'plugin/package.json']) assert.equal(JSON.parse(read(path)).name, 'dsh-vault-plugin')
  assert.match(read('plugin/cordis.patch.yml'), /name: 'dsh-vault-plugin'/)
  assert.match(read('plugin/cordis.patch.yml'), /id: dsh-vault/)
})
