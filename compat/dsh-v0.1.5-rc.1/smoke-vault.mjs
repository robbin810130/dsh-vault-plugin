import { mkdtemp, mkdir, writeFile, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from '../../plugin/node_modules/playwright/index.mjs'
const root = process.cwd()
const home = await mkdtemp(join(tmpdir(), 'dsh-v015-vault-'))
const profile = join(home, 'profiles/web')
await mkdir(profile, { recursive: true })
await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'vault-smoke', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@robbin810130/dsh-vault-plugin'] } } }))
await writeFile(join(profile, 'cordis.yml'), '[]\n')
await writeFile(join(profile, 'cordis.patch.yml'), '[]\n')
await symlink('/Users/Robbin/.dsh/profiles/web/node_modules', join(profile, 'node_modules'))
const child = spawn(process.execPath, ['/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js', 'web', '--no-open', '--port', '3180'], { env: { ...process.env, DSH_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', b => { output += b })
child.stderr.on('data', b => { output += b })
let browser
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const match = output.match(/http:\/\/127\.0\.0\.1:3180\/\?token=[^\s\x1b]+/)
      if (match) { clearInterval(timer); resolve(match[0]) }
    }, 100)
    setTimeout(() => { clearInterval(timer); reject(new Error(output.replace(/token=[^\s]+/g, 'token=REDACTED'))) }, 20000).unref()
  })
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(5000)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const paths = { 'dsh-client-ui-layout': 'client/ui-layout', 'dsh-api-session-controller': 'api/session-controller', 'dsh-client-ui-workspace': 'client/ui-workspace', 'dsh-client-ui-conversation': 'client/ui-conversation' }
  await page.route('**/plugins/**/client.js*', async route => {
    const url = decodeURIComponent(route.request().url())
    const names = Object.keys(paths).filter(name => url.includes(`/${name}/`))
    if (!names.length) return route.continue()
    const entries = url.includes('/plugins/??') ? url.split('/plugins/??')[1].split('&')[0].split(',') : [url.split('/plugins/')[1].split('?')[0]]
    const body = (await Promise.all(entries.map(async entry => {
      const name = names.find(n => entry.includes(`/${n}/`))
      if (name) return readFile(resolve(root, 'packages', paths[name], 'lib/client.js'), 'utf8')
      const packageName = entry.replace(/\/client\.js$/, '')
      try { return await readFile(`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/${packageName}/lib/client.js`, 'utf8') }
      catch { return readFile(`/Users/Robbin/.dsh/profiles/web/node_modules/${packageName}/lib/client.js`, 'utf8') }
    }))).join('\n;\n')
    await route.fulfill({ contentType: 'text/javascript', body })
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const continueButton = page.getByRole('button', { name: '继续', exact: true })
  await continueButton.waitFor({ timeout: 8000 })
  await continueButton.click()
  console.log('accepted disclaimer')
  await continueButton.waitFor({ state: 'hidden' })
  console.log('after-disclaimer', await page.locator('body').innerText())
  await page.getByRole('button', { name: '稍后配置', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  console.log('settings', await page.locator('body').innerText())
  await page.getByRole('button', { name: '插件', exact: true }).first().click()
  await page.getByRole('button', { name: /展开设置: 保险箱/ }).click()
  console.log(JSON.stringify({ home, errors, text: await page.locator('body').innerText() }))
  const post = async (path, data) => {
    const response = await page.request.post('http://127.0.0.1:3180' + path, { headers: { origin: 'http://127.0.0.1:3180' }, data })
    const body = await response.json()
    const result = path === '/dsh-vault/api' ? body : body.result
    if (!result?.ok) throw new Error(JSON.stringify(body))
    return result.value
  }
  const rpc = (method, request) => post('/api/' + method, { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } })
  const { workspace } = await rpc('workspace/create', { path: home })
  const { sessionId } = await rpc('session/create', { workspaceId: workspace.id })
  const title = 'VAULT-SMOKE-SECRET'
  await rpc('session/rename', { sessionId, title })
  const password = 'Smoke!Temporary9Aa'
  const clientInstanceId = 'smoke-seed'
  const { intent } = await post('/dsh-vault/api', { action: 'group-create-intent', clientInstanceId })
  const group = await post('/dsh-vault/api', { action: 'group-create', intent, clientInstanceId, expectedRevision: 0, grants: [], input: { name: 'Smoke group', password, bindings: [] } })
  const groupId = group.snapshot.groups[0].id
  const unlocked = await post('/dsh-vault/api', { action: 'unlock', clientInstanceId, groupId, password })
  const now = new Date().toISOString()
  await post('/dsh-vault/api', { action: 'bindings-update', clientInstanceId, expectedRevision: 1, grants: [unlocked.grant], input: { kind: 'replace', binding: { targetType: 'session', targetId: sessionId, mode: 'direct', passwordGroupId: groupId, createdAt: now, updatedAt: now } } })
  await page.evaluate(id => localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id })), sessionId)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  console.log('locked-page', await page.locator('body').innerText(), errors)
  const skip = page.getByRole('button', { name: '稍后配置', exact: true })
  if (await skip.isVisible()) await skip.click()
  await page.getByText('已加密对话', { exact: true }).first().waitFor()
  if ((await page.content()).includes(title)) {
    console.log('leak-elements', await page.locator('*').evaluateAll((es, title) => es.filter(e => [...e.attributes].some(a => a.value.includes(title)) || (e.children.length === 0 && e.textContent.includes(title))).map(e => e.outerHTML.slice(0, 1200)), title))
    throw new Error('Locked title leaked')
  }
  await page.getByText('已加密对话', { exact: true }).first().click()
  await page.getByRole('button', { name: '解锁', exact: true }).click()
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('dialog').getByRole('button', { name: '解锁', exact: true }).click()
  await page.waitForTimeout(700)
  console.log('after-unlock', await page.locator('body').innerText(), await page.title(), errors)
  if (!(await page.title()).includes(title)) throw new Error('Unlock did not restore document title')
  if (await page.getByText('已加密对话', { exact: true }).count()) throw new Error('Sidebar remained concealed after unlock')
  if (!(await page.locator('[data-composer-seat]').count())) throw new Error('Composer not restored after unlock')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('已加密对话', { exact: true }).first().waitFor()
  if ((await page.content()).includes(title)) throw new Error('Title leaked after reload/relock')
  if (errors.length) throw new Error(JSON.stringify(errors))
  console.log('PASS: locked title concealed, unlock restores title; no browser errors')
} finally {
  await browser?.close()
  child.kill('SIGTERM')
}
