import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright/test'
import { expect, test } from './fixtures.js'

async function dismissFirstRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置', exact: true }).waitFor()
  const welcome = page.getByRole('button', { name: '继续', exact: true })
  if (await welcome.isVisible().catch(() => false)) await welcome.click()
  const apiKey = page.getByRole('button', { name: '稍后配置', exact: true })
  if (await apiKey.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) await apiKey.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function openVaultGroups(page: Page): Promise<void> {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await page.getByRole('tab', { name: '密码组', exact: true }).click()
}

test('refuses a Vault API request with a mismatched browser origin', async ({ request, dsh }) => {
  const response = await request.post(`${dsh.origin}/dsh-vault/api`, {
    headers: { origin: 'http://remote.example.test', 'content-type': 'application/json' },
    data: { action: 'snapshot', clientInstanceId: 'remote-origin-e2e' },
  })
  expect(response.status()).toBe(403)
  await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: 'origin-refused' } })
})

test('shares Host-side Vault state across independent browser tabs', async ({ browser, request, dsh }) => {
  const create = await request.post(`${dsh.origin}/dsh-vault/api`, {
    headers: { origin: dsh.origin, 'content-type': 'application/json' },
    data: {
      action: 'group-create',
      clientInstanceId: 'multi-tab-seed',
      expectedRevision: 0,
      grants: [],
      input: { name: '多标签页测试组', password: `Vt!${randomUUID()}Aa9`, bindings: [] },
    },
  })
  expect(create.status()).toBe(200)
  expect((await create.json() as { ok?: boolean }).ok).toBe(true)

  const contextA = await browser.newContext({ locale: 'zh-CN' })
  const contextB = await browser.newContext({ locale: 'zh-CN' })
  try {
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    await Promise.all([pageA.goto(dsh.origin), pageB.goto(dsh.origin)])
    await Promise.all([dismissFirstRun(pageA), dismissFirstRun(pageB)])
    await Promise.all([openVaultGroups(pageA), openVaultGroups(pageB)])
    await expect(pageA.getByText('多标签页测试组', { exact: true })).toHaveCount(1)
    await expect(pageB.getByText('多标签页测试组', { exact: true })).toHaveCount(1)
  } finally {
    await Promise.all([contextA.close(), contextB.close()])
  }
})

test('revokes old grants and rotates recovery material after credential changes', async ({ request, dsh }) => {
  const clientInstanceId = 'credential-rotation-e2e'
  const oldPassword = 'Old!' + randomUUID() + 'Aa9'
  const newPassword = 'New!' + randomUUID() + 'Bb8'
  const recoveredPassword = 'Recovery!' + randomUUID() + 'Cc7'
  const post = async (data: Record<string, unknown>) => {
    const response = await request.post(dsh.origin + '/dsh-vault/api', {
      headers: { origin: dsh.origin, 'content-type': 'application/json' },
      data: { clientInstanceId, ...data },
    })
    expect(response.status()).toBe(200)
    return await response.json() as any
  }

  const created = await post({
    action: 'group-create', expectedRevision: 0, grants: [],
    input: { name: '凭据轮换测试组', password: oldPassword, bindings: [] },
  })
  expect(created.ok).toBe(true)
  const groupId = created.value.snapshot.groups[0].id as string
  const oldRecoveryKey = created.value.recoveryKey as string

  const unlocked = await post({ action: 'unlock', groupId, password: oldPassword })
  expect(unlocked.ok).toBe(true)
  const oldGrant = unlocked.value.grant
  expect((await post({ action: 'grants-validate', grants: [oldGrant] })).value.valid).toBe(true)

  const changed = await post({
    action: 'group-change-password', expectedRevision: 1,
    input: { groupId, currentPassword: oldPassword, newPassword, rotateRecovery: true },
  })
  expect(changed.ok).toBe(true)
  const rotatedRecoveryKey = changed.value.recoveryKey as string
  expect(rotatedRecoveryKey).not.toBe(oldRecoveryKey)
  expect((await post({ action: 'grants-validate', grants: [oldGrant] })).value.valid).toBe(false)
  expect((await post({ action: 'unlock', groupId, password: oldPassword })).error.code).toBe('invalid-credentials')
  expect((await post({ action: 'group-recover', expectedRevision: 2, input: { groupId, recoveryKey: oldRecoveryKey, newPassword: recoveredPassword } })).error.code).toBe('invalid-credentials')

  const recovered = await post({
    action: 'group-recover', expectedRevision: 2,
    input: { groupId, recoveryKey: rotatedRecoveryKey, newPassword: recoveredPassword },
  })
  expect(recovered.ok).toBe(true)
  expect(recovered.value.recoveryKey).not.toBe(rotatedRecoveryKey)
  expect((await post({ action: 'unlock', groupId, password: newPassword })).error.code).toBe('invalid-credentials')
  expect((await post({ action: 'unlock', groupId, password: recoveredPassword })).ok).toBe(true)

  const persisted = await readFile(join(dsh.home, 'vault-lock', 'state.json'), 'utf8')
  for (const secret of [oldPassword, newPassword, recoveredPassword, oldRecoveryKey, rotatedRecoveryKey]) {
    expect(persisted).not.toContain(secret)
  }
})

test('persists groups across Host restart while invalidating volatile grants', async ({ request, dsh }) => {
  const clientInstanceId = 'host-restart-e2e'
  const password = 'Restart!' + randomUUID() + 'Dd6'
  const post = async (data: Record<string, unknown>) => {
    const response = await request.post(dsh.origin + '/dsh-vault/api', {
      headers: { origin: dsh.origin, 'content-type': 'application/json' },
      data: { clientInstanceId, ...data },
    })
    expect(response.status()).toBe(200)
    return await response.json() as any
  }

  const created = await post({
    action: 'group-create', expectedRevision: 0, grants: [],
    input: { name: 'Host 重启测试组', password, bindings: [] },
  })
  const groupId = created.value.snapshot.groups[0].id as string
  const unlocked = await post({ action: 'unlock', groupId, password })
  const grant = unlocked.value.grant
  expect((await post({ action: 'grants-validate', grants: [grant] })).value.valid).toBe(true)

  await dsh.restart()

  const snapshot = await post({ action: 'snapshot' })
  expect(snapshot.value.groups).toEqual(expect.arrayContaining([expect.objectContaining({ id: groupId, name: 'Host 重启测试组' })]))
  expect((await post({ action: 'grants-validate', grants: [grant] })).value.valid).toBe(false)
  expect((await post({ action: 'unlock', groupId, password })).ok).toBe(true)
})
