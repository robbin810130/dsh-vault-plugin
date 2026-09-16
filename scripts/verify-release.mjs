import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag ?? '')) {
  throw new Error('Expected an explicit version tag (vX.Y.Z)')
}
for (const file of ['package.json', 'plugin/package.json']) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  if (`v${manifest.version}` !== tag) throw new Error(`${file} version does not match ${tag}`)
}
const notes = join('docs', 'releases', `${tag}.md`)
if (!readFileSync(notes, 'utf8').trim()) throw new Error('Release notes must not be empty')
console.log(`Verified ${tag}: both manifests and ${notes}`)
