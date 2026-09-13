import { build } from 'tsdown'
import { clientBundle } from './packages/client/tsdown.client.ts'
import { resolve } from 'node:path'
const root = process.cwd()
for (const [path, id] of [
  ['packages/api/session-controller', '@deepseek-ai/dsh-api-session-controller'],
  ['packages/client/ui-workspace', '@deepseek-ai/dsh-client-ui-workspace'],
  ['packages/client/ui-layout', '@deepseek-ai/dsh-client-ui-layout'],
  ['packages/client/ui-conversation', '@deepseek-ai/dsh-client-ui-conversation'],
]) {
  process.chdir(resolve(root, path))
  const configs = clientBundle(id, [])({ env: {} })
  const config = configs.find(c => c.name === `${id}/client`)
  await build({ ...config, config: false, define: { ...config.define, 'process.env.DSH_CLIENT_TITLE': JSON.stringify('DeepSeek Harness') }, alias: {
    '@deepseek-ai/dsh-brand': resolve(root, 'packages/util/brand/src/index.ts'),
    '@deepseek-ai/dsh-util-values': resolve(root, 'packages/util/values/src/index.ts'),
    '@deepseek-ai/dsh-util-crypto': resolve(root, 'packages/util/crypto/src/index.ts'),
  } })
}
