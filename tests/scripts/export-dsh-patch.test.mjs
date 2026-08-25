import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { PINNED_COMMIT } from '../../scripts/prepare-dsh-source.mjs'

const execFileAsync = promisify(execFile)
const repoRoot = join(fileURLToPath(new URL('../..', import.meta.url)))
const sourceCheckout = join(repoRoot, '.cache', 'deepseek-harness')
const patchPath = join(repoRoot, 'compat', 'dsh-v0.1.1-rc.2', '0001-plugin-access-seams.patch')

const required = [
  'packages/client/runtime/src/client/navigation/access.ts',
  'packages/client/ui-agent-preset/src/client/index.ts',
  'packages/client/ui-sidebar/src/client/contract/slots.ts',
  'packages/client/ui-workspace/src/client/row-extensions.ts',
  'packages/client/ui-conversation/tests/access-gate.client.spec.tsx',
  'packages/extensions/cordis-client-runner/src/client/api-catalog.ts',
  'packages/test-support/client-runtime/src/workspaces.ts',
]

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' })
  return stdout
}

test('exported DSH compatibility patch applies to pinned upstream and contains required seams', async () => {
  assert.equal(existsSync(patchPath), true, `missing exported patch: ${patchPath}`)
  const patch = await readFile(patchPath, 'utf8')

  for (const file of required) {
    assert.match(
      patch,
      new RegExp(`^diff --git a/${file} b/${file}$`, 'm'),
      `expected patch entry: ${file}`,
    )
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'dsh-patch-roundtrip-'))
  try {
    await git(tempDir, ['clone', '--no-checkout', sourceCheckout, 'checkout'])

    const checkout = join(tempDir, 'checkout')
    await git(checkout, ['checkout', '--detach', PINNED_COMMIT])
    await git(checkout, ['apply', '--check', patchPath])
    await git(checkout, ['apply', patchPath])

    for (const file of required) {
      assert.equal(existsSync(join(checkout, file)), true, `expected patched file: ${file}`)
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
