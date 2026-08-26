import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))

test('POSIX installer downloads and verifies the latest release before native DSH install', () => {
  const source = readFileSync(`${root}/install.sh`, 'utf8')
  assert.match(source, /releases\/latest\/download\/\$\{ASSET\}/)
  assert.match(source, /shasum -a 256/)
  assert.match(source, /sha256sum/)
  assert.match(source, /dsh plugin --profile web add/)
  assert.match(source, /trap cleanup EXIT/)
  assert.doesNotMatch(source, /eval|curl[^\n]*\|/)
  assert.equal(statSync(`${root}/install.sh`).mode & 0o111, 0o111)
})

test('PowerShell installer verifies checksum and uses native DSH install', () => {
  const source = readFileSync(`${root}/install.ps1`, 'utf8')
  assert.match(source, /releases\/latest\/download/)
  assert.match(source, /Get-FileHash/)
  assert.match(source, /dsh plugin --profile web add/)
  assert.match(source, /Remove-Item .*Recurse -Force/)
})
