import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const PINNED_COMMIT = 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'
const REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness.git'
const TAG = 'dsh-v0.1.1-rc.2'

export function validateHead(head) {
  if (head !== PINNED_COMMIT) throw new Error(`unexpected DSH commit: ${head}`)
}

async function defaultRun(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, {
    ...options,
    encoding: 'utf8',
  })
  return stdout
}

async function git(run, cwd, args) {
  return run('git', args, { cwd })
}

export async function prepareDshSource({ root, run = defaultRun } = {}) {
  if (!root) throw new Error('root is required')

  const absoluteRoot = isAbsolute(root) ? root : join(process.cwd(), root)
  const cacheDir = join(absoluteRoot, '.cache')
  const checkoutPath = join(cacheDir, 'deepseek-harness')

  await run('gh', ['auth', 'status'], { cwd: absoluteRoot })
  await mkdir(cacheDir, { recursive: true })

  try {
    await git(run, checkoutPath, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    await run('git', ['clone', '--branch', TAG, '--depth', '1', REPOSITORY, checkoutPath], { cwd: absoluteRoot })
  }

  const dirty = (await git(run, checkoutPath, ['status', '--porcelain'])).trim()
  if (dirty) throw new Error(`dirty DSH checkout: ${checkoutPath}`)

  await git(run, checkoutPath, ['fetch', '--tags', '--force', 'origin', TAG])
  await git(run, checkoutPath, ['checkout', '--detach', TAG])

  const head = (await git(run, checkoutPath, ['rev-parse', 'HEAD'])).trim()
  validateHead(head)

  return checkoutPath
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  prepareDshSource({ root })
    .then((checkoutPath) => {
      console.log(checkoutPath)
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
