import { randomUUID } from 'node:crypto'
import type { Page } from 'playwright/test'
import { expect, test } from './fixtures.js'

async function dismissFirstRun(page: Page): Promise<void> {
  const welcome = page.getByRole('button', { name: '继续', exact: true })
  if (await welcome.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)) await welcome.click()
  const apiKey = page.getByRole('button', { name: '稍后配置', exact: true })
  if (await apiKey.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) await apiKey.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const settings = page.getByRole('button', { name: '设置', exact: true })
  if (await settings.count() === 0) {
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
  }
  await settings.waitFor()
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`keeps Vault settings usable at 390px in ${colorScheme} mode`, async ({ browser, request, dsh }) => {
    const longName = '超长中文密码组名称用于验证窄屏布局不会横向溢出或遮挡操作按钮'
    const create = await request.post(`${dsh.origin}/dsh-vault/api`, {
      headers: { origin: dsh.origin, 'content-type': 'application/json' },
      data: {
        action: 'group-create',
        clientInstanceId: `visual-${colorScheme}`,
        expectedRevision: 0,
        grants: [],
        input: { name: longName, password: `Vt!${randomUUID()}Aa9`, bindings: [] },
      },
    })
    expect((await create.json() as { ok?: boolean }).ok).toBe(true)

    const context = await browser.newContext({ colorScheme, locale: 'zh-CN', viewport: { width: 390, height: 844 } })
    try {
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
      await page.goto(dsh.origin)
      await dismissFirstRun(page)
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page.getByRole('button', { name: '插件', exact: true }).click()
      await page.getByRole('tab', { name: '密码组', exact: true }).click()

      const vault = page.getByRole('region', { name: '保险箱', exact: true })
      await expect(vault).toBeVisible()
      await expect(vault.getByText(longName, { exact: true })).toHaveCount(1)
      const layout = await vault.evaluate(element => {
        const box = element.getBoundingClientRect()
        return {
          left: box.left,
          right: box.right,
          viewport: document.documentElement.clientWidth,
          overflow: element.scrollWidth > element.clientWidth,
        }
      })
      expect(layout.left).toBeGreaterThanOrEqual(0)
      expect(layout.right).toBeLessThanOrEqual(layout.viewport)
      expect(layout.overflow).toBe(false)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}
