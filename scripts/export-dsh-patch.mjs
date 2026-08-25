import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { PINNED_COMMIT } from './prepare-dsh-source.mjs'

const execFileAsync = promisify(execFile)
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const defaultSource = join(repoRoot, '.cache', 'deepseek-harness')
const defaultOutput = join(repoRoot, 'compat', 'dsh-v0.1.1-rc.2', '0001-plugin-access-seams.patch')
const diffPackages = [
  'packages/client/runtime',
  'packages/client/ui-agent-preset',
  'packages/client/ui-sidebar',
  'packages/client/ui-workspace',
  'packages/client/ui-conversation',
  'packages/extensions/cordis-client-runner',
  'packages/test-support/client-runtime',
]

function readArg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return isAbsolute(value) ? value : join(process.cwd(), value)
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  })
  return stdout
}

export async function exportDshPatch({ source = defaultSource, output = defaultOutput } = {}) {
  const dirty = (await git(source, ['status', '--porcelain'])).trim()
  if (dirty) throw new Error(`dirty DSH checkout: ${source}`)

  await git(source, ['merge-base', '--is-ancestor', PINNED_COMMIT, 'HEAD'])

  const diff = await git(source, [
    'diff',
    '--binary',
    `${PINNED_COMMIT}..HEAD`,
    '--',
    ...diffPackages,
  ])

  if (!diff) throw new Error('empty DSH compatibility patch')

  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, diff)

  return output
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const source = readArg('--source', defaultSource)
  const output = readArg('--output', defaultOutput)

  exportDshPatch({ source, output })
    .then((patchPath) => {
      console.log(patchPath)
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
