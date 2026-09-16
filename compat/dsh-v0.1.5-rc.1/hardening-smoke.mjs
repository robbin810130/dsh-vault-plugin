import { mkdtemp, mkdir, writeFile, symlink, readFile, readdir, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from '../../plugin/node_modules/playwright/index.mjs'
const root = process.cwd()
const home = await mkdtemp(join(tmpdir(), 'vault-026-smoke-'))
const profile = join(home, 'profiles/web')
const installed = '/Users/Robbin/.dsh/profiles/web/node_modules'
const modules = join(profile, 'node_modules')
await mkdir(modules, {recursive:true})
await writeFile(join(profile,'package.json'),JSON.stringify({name:'vault-smoke',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@robbin810130/dsh-vault-plugin']}}}))
for(const name of ['cordis.yml','cordis.patch.yml']) await writeFile(join(profile,name),'[]\n')
for(const entry of await readdir(installed)) {
  if(entry!=='@robbin810130') await symlink(join(installed,entry),join(modules,entry))
}
await mkdir(join(modules,'@robbin810130'))
for(const entry of await readdir(join(installed,'@robbin810130'))) {
  if(entry!=='dsh-vault-plugin') await symlink(join(installed,'@robbin810130',entry),join(modules,'@robbin810130',entry))
}
const candidate = join(modules,'@robbin810130/dsh-vault-plugin')
await mkdir(candidate)
for(const entry of ['package.json','lib','cordis.patch.yml','README.md','LICENSE']) await cp(resolve(root,'../../plugin',entry),join(candidate,entry),{recursive:true})
const child = spawn(process.execPath,['/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js','web','--no-open','--port','3180'],{env:{...process.env,DSH_HOME:home},stdio:['ignore','pipe','pipe']})
let output='', browser
child.stdout.on('data',b=>output+=b)
child.stderr.on('data',b=>output+=b)
try {
  const url=await new Promise((resolve,reject)=>{
    const timer=setInterval(()=>{ const m=output.match(/http:[/][/]127\.0\.0\.1:3180[/]\?token=[^\s\x1b]+/); if(m){clearInterval(timer);resolve(m[0])}},100)
    setTimeout(()=>{clearInterval(timer);reject(Error(output.replace(/token=[^\s]+/g,'token=REDACTED')))},20000).unref()
  })
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(8000)
  const errors=[]; const observed=new Set()
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  const paths={'dsh-client-ui-layout':'client/ui-layout','dsh-api-session-controller':'api/session-controller','dsh-client-ui-workspace':'client/ui-workspace','dsh-client-ui-conversation':'client/ui-conversation'}
  await page.route('**/plugins/**/client.js*',async route=>{
    const url=decodeURIComponent(route.request().url())
    const entries=url.includes('/plugins/??')?url.split('/plugins/??')[1].split('&')[0].split(','):[url.split('/plugins/')[1].split('?')[0]]
    const body=(await Promise.all(entries.map(async entry=>{
      const name=Object.keys(paths).find(n=>entry.includes('/'+n+'/'))
      if(name){observed.add(name);return readFile(resolve(root,'packages',paths[name],'lib/client.js'),'utf8')}
      const pkg=entry.replace(/[/]client\.js$/,'')
      if(pkg==='@robbin810130/dsh-vault-plugin')return readFile(join(candidate,'lib/client.js'),'utf8')
      try{return await readFile('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/'+pkg+'/lib/client.js','utf8')}
      catch{return readFile(join(installed,pkg,'lib/client.js'),'utf8')}
    }))).join('\n;\n')
    await route.fulfill({contentType:'text/javascript',body})
  })
  await page.goto(url,{waitUntil:'domcontentloaded'})
  await page.getByRole('button',{name:'继续',exact:true}).click()
  await page.getByRole('button',{name:'稍后配置',exact:true}).click()
  const post=async(path,data)=>{
    const r=await page.request.post('http://127.0.0.1:3180'+path,{headers:{origin:'http://127.0.0.1:3180'},data})
    const body=await r.json(),result=path==='/dsh-vault/api'?body:body.result
    if(!result?.ok)throw Error(JSON.stringify(body));return result.value
  }
  const snapshot=()=>post('/dsh-vault/api',{action:'snapshot',clientInstanceId:'verify'})
  const rpc=(method,request)=>post('/api/'+method,{type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{request}}})
  await page.getByRole('button',{name:'设置',exact:true}).click()
  await page.getByRole('button',{name:'插件',exact:true}).first().click()
  await page.getByRole('button',{name:/展开设置: 保险箱/}).click()
  const before=await snapshot(),input=page.getByLabel('密码最小长度',{exact:true})
  await input.fill('');await input.pressSequentially('12',{delay:100})
  if((await snapshot()).revision!==before.revision)throw Error('Draft wrote policy')
  await page.getByRole('button',{name:'保存策略',exact:true}).click()
  await page.waitForTimeout(500)
  if((await snapshot()).policy.passwordPolicy.minLength!==12)throw Error('Policy not saved')
  if(observed.size!==4)throw Error('Missing patched bundles: '+[...observed]); console.log('PASS four patched bundles, policy draft and explicit save')
  const project=join(home,'SyntheticProject');await mkdir(project)
  const {workspace}=await rpc('workspace/create',{path:project})
  const {sessionId}=await rpc('session/create',{workspaceId:workspace.workspaceId})
  await rpc('session/rename',{sessionId,title:'SYNTHETIC-PRIVATE-TITLE'})
  // No model request: transport fixtures make the disposable blank session
  // searchable and supply a synthetic content hit; all Vault operations are real.
  await page.route('**/api/session/list',async route=>{
    const response=await route.fetch(),body=await response.json()
    for(const item of body.result?.value?.items??body.result?.value??[])if(item.sessionId===sessionId)item.blank=false
    await route.fulfill({response,json:body})
  })
  await page.route('**/api/session/search',async route=>{
    const response=await route.fetch(),body=await response.json()
    body.result={ok:true,value:{items:[{sessionId,snippet:'SYNTHETIC-SECRET-SNIPPET'}],hasMore:false}}
    await route.fulfill({response,json:body})
  })
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForTimeout(600)
  const skip=page.getByRole('button',{name:'稍后配置',exact:true})
  if(await skip.isVisible()) await skip.click()
  await page.keyboard.press('Escape')
  const row=page.locator('[role=treeitem][aria-expanded]').first()
  await row.hover();await row.getByRole('button',{name:'上锁',exact:true}).click()
  await page.getByLabel('密码',{exact:true}).fill('Probe!1234567Aa')
  await page.getByLabel('确认密码',{exact:true}).fill('Probe!1234567Aa')
  await page.getByRole('button',{name:'保存并上锁',exact:true}).click()
  await page.getByRole('dialog',{name:'请保存恢复密钥',exact:true}).waitFor()
  const recovery=await page.locator('.dsh-vault-recovery-key').innerText()
  if(recovery.length<20)throw Error('Recovery missing')
  if((await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).includes(recovery))throw Error('Recovery persisted')
  await page.getByRole('button',{name:'我已保存恢复密钥',exact:true}).click()
  if((await page.content()).includes(recovery))throw Error('Recovery not erased')
  const after=await snapshot()
  if(!after.bindings.some(x=>x.targetType==='workspace'&&x.targetId===workspace.workspaceId))throw Error('Workspace not protected')
  if(after.groups.some(x=>x.name.includes('SyntheticProject')))throw Error('Title copied to group')
  console.log('PASS workspace quicklock, recovery delivery and neutral alias')
  await page.evaluate(id=>localStorage.setItem('dsh.sessions.current',JSON.stringify({sessionId:id})),sessionId)
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForTimeout(900)
  if(await skip.isVisible()) await skip.click()
  await page.getByText('需要解锁才能查看内容',{exact:true}).waitFor()
  if((await page.content()).includes('SYNTHETIC-PRIVATE-TITLE'))throw Error('Title leaked on reload')
  await page.getByRole('button',{name:'搜索会话',exact:true}).first().click()
  await page.getByPlaceholder('搜索会话…',{exact:true}).fill('SYNTHETIC')
  await page.getByRole('tree',{name:'搜索结果',exact:true}).getByText('已加密对话',{exact:true}).waitFor()
  if((await page.content()).includes('SYNTHETIC-PRIVATE-TITLE'))throw Error('Inherited search title leaked')
  if((await page.content()).includes('SYNTHETIC-SECRET-SNIPPET'))throw Error('Inherited search snippet leaked')
  await page.getByPlaceholder('搜索会话…',{exact:true}).fill('')
  await page.keyboard.press('Escape')
  console.log('PASS inherited search title/snippet concealment (synthetic transport fixture)')
  await page.getByRole('button',{name:'解锁',exact:true}).click()
  await page.getByLabel('密码',{exact:true}).fill('Probe!1234567Aa')
  await page.getByRole('dialog').getByRole('button',{name:'解锁',exact:true}).click()
  await page.waitForFunction(()=>document.title.includes('SYNTHETIC-PRIVATE-TITLE'))
  await page.locator('[data-composer-seat]').waitFor()
  await page.reload({waitUntil:'domcontentloaded'})
  await page.getByText('需要解锁才能查看内容',{exact:true}).waitFor()
  if((await page.content()).includes('SYNTHETIC-PRIVATE-TITLE'))throw Error('Title leaked after relock')
  if(errors.length)throw Error(JSON.stringify(errors))
  console.log('PASS inherited protection, unlock title/composer, reload relock; no browser errors')
  await page.setViewportSize({width:390,height:844})
  await page.getByText('需要解锁才能查看内容',{exact:true}).waitFor()
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Locked page horizontal overflow at 390')
  await page.screenshot({path:join(home,'locked-390.png')})
  await page.setViewportSize({width:1440,height:900})
  await page.screenshot({path:join(home,'locked-1440.png')})
  let releaseSnapshot; let snapshotIntercepted=false
  const snapshotGate=new Promise(resolve=>{releaseSnapshot=resolve})
  await page.route('**/dsh-vault/api',async route=>{
    if(route.request().postDataJSON()?.action==='snapshot'){snapshotIntercepted=true;await snapshotGate;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'operation-failed',message:'Synthetic unavailable'}})})}
    return route.continue()
  })
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForTimeout(900)
  if(!snapshotIntercepted)throw Error('Snapshot gate not exercised')
  if((await page.content()).includes('SYNTHETIC-PRIVATE-TITLE'))throw Error('First pending snapshot leaked title')
  releaseSnapshot();await page.waitForTimeout(900)
  if((await page.content()).includes('SYNTHETIC-PRIVATE-TITLE'))throw Error('First failed snapshot leaked title')
  if(await page.locator('[data-composer-seat]').count())throw Error('Composer present while Vault offline')
  console.log('PASS 1440/390 locked layout, delayed/failed first snapshot fail-closed')
  console.log('EVIDENCE_HOME',home)
} finally {
  await browser?.close();child.kill('SIGTERM')
  await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve)})
}
