import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Page } from 'playwright/test'
import { expect, test } from './fixtures.js'

async function dismissFirstRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置', exact: true }).waitFor()
  const welcome = page.getByRole('button', { name: '继续', exact: true })
  if (await welcome.isVisible().catch(() => false)) await welcome.click()
  const apiKey = page.getByRole('button', { name: '稍后配置', exact: true })
  if (await apiKey.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) {
    await apiKey.click()
  }
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function openVaultGroups(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await page.getByRole('tab', { name: '密码组', exact: true }).click()
}

test('loads the installed Vault client in a real DSH web profile', async ({ page, dsh }) => {
  await page.goto(dsh.origin)
  await expect(page.getByText('Failed to load plugins')).toHaveCount(0)
  await expect(page.locator('style[data-plugin="@robbin810130/dsh-vault-plugin"]')).toHaveCount(1)
})

test('startup-restored native navigation cannot reveal a locked session title', async ({ page, dsh }) => {
  const locked = await dsh.seedLockedSession({ title: 'VAULT-SECRET-SESSION-TITLE' })
  await page.goto(dsh.origin)
  await dismissFirstRun(page)
  await page.evaluate(id => {
    localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id }))
  }, locked.id)
  await page.reload()
  await dismissFirstRun(page)
  await expect(page.getByText('需要解锁才能查看内容')).toBeVisible()
  await expect(page.getByText(locked.title, { exact: true })).toHaveCount(0)
  expect(await page.content()).not.toContain(locked.title)
})

test('creates a password group and exposes its recovery key only once', async ({ page, dsh }) => {
  const password = `Vt!${randomUUID()}Aa9`
  await page.goto(dsh.origin)
  await dismissFirstRun(page)
  await openVaultGroups(page)
  await page.getByRole('button', { name: '新建密码组', exact: true }).click()
  await page.getByRole('textbox', { name: '密码组名称', exact: true }).fill('E2E 密码组')
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(password)
  await page.getByRole('textbox', { name: '确认密码', exact: true }).fill(password)
  await page.getByRole('button', { name: '创建密码组', exact: true }).click()

  const recovery = page.locator('output.dsh-vault-recovery-key')
  await expect(recovery).toHaveCount(1)
  const recoveryKey = await recovery.textContent()
  expect(recoveryKey?.length).toBeGreaterThan(20)
  if (recoveryKey === null) throw new Error('Vault did not return a recovery key')

  const browserPersistedSecret = await page.evaluate(({ passwordValue, recoveryValue }) => {
    const values = [localStorage, sessionStorage].flatMap(storage => (
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .flatMap(key => [key, storage.getItem(key) ?? ''])
    ))
    const serialized = values.join('\n')
    return serialized.includes(passwordValue) || serialized.includes(recoveryValue) || /grantToken/i.test(serialized)
  }, { passwordValue: password, recoveryValue: recoveryKey })
  expect(browserPersistedSecret).toBe(false)

  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(recovery).toHaveCount(0)
  await page.reload()
  await dismissFirstRun(page)
  await openVaultGroups(page)
  await expect(page.getByText('E2E 密码组', { exact: true })).toHaveCount(1)
  await expect(recovery).toHaveCount(0)

  const state = await readFile(join(dsh.home, 'vault-lock', 'state.json'), 'utf8')
  expect(state).not.toContain(password)
  expect(state).not.toContain(recoveryKey)
  expect(state).not.toMatch(/"(?:recoveryKey|grantToken|rawPassword|plaintext)"/i)
})

test('changes and recovers group credentials through the installed DSH UI', async ({ page, request, dsh }) => {
  const groupName = 'E2E 凭据组'
  const oldPassword = `Old!${randomUUID()}Aa9`
  const newPassword = `New!${randomUUID()}Bb8`
  const recoveredPassword = `Recovered!${randomUUID()}Cc7`
  const post = async (data: Record<string, unknown>) => {
    const response = await request.post(dsh.origin + '/dsh-vault/api', {
      headers: { origin: dsh.origin, 'content-type': 'application/json' },
      data: { clientInstanceId: 'ui-credential-e2e', ...data },
    })
    expect(response.status()).toBe(200)
    return await response.json() as any
  }

  await page.goto(dsh.origin)
  await dismissFirstRun(page)
  await openVaultGroups(page)
  await page.getByRole('button', { name: '新建密码组', exact: true }).click()
  await page.getByRole('textbox', { name: '密码组名称', exact: true }).fill(groupName)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(oldPassword)
  await page.getByRole('textbox', { name: '确认密码', exact: true }).fill(oldPassword)
  await page.getByRole('button', { name: '创建密码组', exact: true }).click()

  const recovery = page.locator('output.dsh-vault-recovery-key')
  const oldRecoveryKey = await recovery.textContent()
  if (oldRecoveryKey === null) throw new Error('Vault did not return the initial recovery key')
  await page.getByRole('button', { name: '完成', exact: true }).click()

  await page.getByRole('button', { name: `修改密码 ${groupName}`, exact: true }).click()
  await page.getByLabel('当前密码', { exact: true }).fill(oldPassword)
  await page.getByLabel('新密码', { exact: true }).fill(newPassword)
  await page.getByLabel('确认新密码', { exact: true }).fill(newPassword)
  await page.getByRole('checkbox', { name: '同时轮换恢复密钥', exact: true }).check()
  await page.getByRole('button', { name: '保存新密码', exact: true }).click()

  await expect(recovery).toHaveCount(1)
  const rotatedRecoveryKey = await recovery.textContent()
  if (rotatedRecoveryKey === null) throw new Error('Vault did not return the rotated recovery key')
  expect(rotatedRecoveryKey).not.toBe(oldRecoveryKey)
  const valuesAfterChange = await page.locator('input').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))
  expect(valuesAfterChange).not.toContain(oldPassword)
  expect(valuesAfterChange).not.toContain(newPassword)
  await page.getByRole('button', { name: '完成', exact: true }).click()

  const snapshot = await post({ action: 'snapshot' })
  const groupId = snapshot.value.groups.find((group: { name: string }) => group.name === groupName)?.id as string | undefined
  if (groupId === undefined) throw new Error('Vault group missing after UI password change')
  expect((await post({ action: 'unlock', groupId, password: oldPassword })).error.code).toBe('invalid-credentials')
  expect((await post({ action: 'unlock', groupId, password: newPassword })).ok).toBe(true)

  await page.getByRole('button', { name: `恢复 ${groupName}`, exact: true }).click()
  await page.getByLabel('恢复密钥', { exact: true }).fill(rotatedRecoveryKey)
  await page.getByLabel('新密码', { exact: true }).fill(recoveredPassword)
  await page.getByLabel('确认新密码', { exact: true }).fill(recoveredPassword)
  await page.getByRole('button', { name: '恢复密码组', exact: true }).click()

  await expect(recovery).toHaveCount(1)
  const newRecoveryKey = await recovery.textContent()
  if (newRecoveryKey === null) throw new Error('Vault did not return the recovered key')
  expect(newRecoveryKey).not.toBe(rotatedRecoveryKey)
  const valuesAfterRecovery = await page.locator('input').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))
  expect(valuesAfterRecovery).not.toContain(rotatedRecoveryKey)
  expect(valuesAfterRecovery).not.toContain(recoveredPassword)

  expect((await post({ action: 'unlock', groupId, password: newPassword })).error.code).toBe('invalid-credentials')
  expect((await post({ action: 'unlock', groupId, password: recoveredPassword })).ok).toBe(true)
  expect((await post({
    action: 'group-recover',
    expectedRevision: 3,
    input: { groupId, recoveryKey: rotatedRecoveryKey, newPassword: 'must-not-apply' },
  })).error.code).toBe('invalid-credentials')

  const browserPersistedSecret = await page.evaluate(secretValues => {
    const persisted = [localStorage, sessionStorage].flatMap(storage => (
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .flatMap(key => [key, storage.getItem(key) ?? ''])
    )).join('\n')
    return secretValues.some(secret => persisted.includes(secret)) || /grantToken/i.test(persisted)
  }, [oldPassword, newPassword, recoveredPassword, oldRecoveryKey, rotatedRecoveryKey, newRecoveryKey])
  expect(browserPersistedSecret).toBe(false)

  const state = await readFile(join(dsh.home, 'vault-lock', 'state.json'), 'utf8')
  for (const secret of [oldPassword, newPassword, recoveredPassword, oldRecoveryKey, rotatedRecoveryKey, newRecoveryKey]) {
    expect(state).not.toContain(secret)
  }
})

test('persists Vault policy edits through the real DSH settings namespace', async ({ page, request, dsh }) => {
  await page.goto(dsh.origin)
  await dismissFirstRun(page)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await page.getByLabel('自动锁定').selectOption('30')

  await expect.poll(async () => {
    const response = await request.post(dsh.origin + '/dsh-vault/api', {
      headers: { origin: dsh.origin, 'content-type': 'application/json' },
      data: { action: 'snapshot', clientInstanceId: 'policy-e2e' },
    })
    const body = await response.json() as any
    return body.value?.policy?.autoLockMinutes
  }).toBe(30)

  await page.reload()
  await dismissFirstRun(page)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await expect(page.getByLabel('自动锁定')).toHaveValue('30')
})
