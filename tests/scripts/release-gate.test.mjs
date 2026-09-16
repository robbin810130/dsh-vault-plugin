import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import test from 'node:test'
const script = resolve('scripts/verify-release.mjs')
function run({ tag = 'v0.2.6', rootVersion = '0.2.6', pluginVersion = '0.2.6', notes = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'vault-release-gate-'))
  try {
    mkdirSync(join(cwd, 'plugin'))
    mkdirSync(join(cwd, 'docs/releases'), { recursive: true })
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: rootVersion }))
    writeFileSync(join(cwd, 'plugin/package.json'), JSON.stringify({ version: pluginVersion }))
    if (notes) writeFileSync(join(cwd, 'docs/releases/' + tag + '.md'), '# Release\n')
    return spawnSync(process.execPath, [script, tag], { cwd, encoding: 'utf8' })
  } finally { rmSync(cwd, { recursive: true, force: true }) }
}
test('release gate accepts matching manifests, tag and release notes', () => assert.equal(run().status, 0))
test('release gate rejects a stale tag', () => assert.notEqual(run({ tag: 'v0.2.5' }).status, 0))
test('release gate rejects divergent wrapper version', () => assert.notEqual(run({ rootVersion: '0.2.5' }).status, 0))
test('release gate rejects missing notes', () => assert.notEqual(run({ notes: false }).status, 0))
