import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { chromium } from '/Users/Robbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = new URL('./vault-ui-interaction-v2.html', import.meta.url);

async function withPage(run, viewport = { width: 1280, height: 800 }) {
  await access(target);
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(target.href);
    await run(page);
    assert.deepEqual(errors, [], '页面不能产生运行时错误');
  } finally {
    await browser.close();
  }
}

test('七种评审状态均可到达，并由 aria-pressed 暴露当前状态', async () => {
  await withPage(async (page) => {
    const views = ['locked', 'unlock', 'wrong', 'offline', 'recovery', 'unlocked', 'settings'];
    for (const view of views) {
      const button = page.locator(`[data-view="${view}"]`);
      await assert.doesNotReject(() => button.click());
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      await assert.doesNotReject(() => page.locator(`[data-scene="${view}"]:visible`).waitFor());
    }
  });
});

test('解锁弹窗拒绝空密码，错误后保留输入并显示剩余次数', async () => {
  await withPage(async (page) => {
    await page.locator('[data-view="unlock"]').click();
    const input = page.getByLabel('保险箱密码');
    const submit = page.getByRole('button', { name: '解锁保险箱', exact: true });
    assert.equal(await submit.isDisabled(), true);
    await input.fill('wrong-password');
    assert.equal(await submit.isDisabled(), false);
    await submit.click();
    await assert.doesNotReject(() => page.locator('[data-password-error]').waitFor());
    assert.equal(await input.inputValue(), 'wrong-password');
  });
});

test('弹窗打开后聚焦密码框，Escape 关闭并把焦点归还触发按钮', async () => {
  await withPage(async (page) => {
    const trigger = page.locator('.button.primary[data-open-vault]');
    await trigger.focus();
    await trigger.click();
    assert.equal(await page.getByLabel('保险箱密码').evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-unlock-dialog]').isHidden(), true);
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
  });
});

test('项目、对话和设置入口都是键盘可聚焦的原生控件', async () => {
  await withPage(async (page) => {
    const tags = await page.locator('[data-sidebar-action]').evaluateAll((nodes) => nodes.map((node) => node.tagName));
    assert.ok(tags.length >= 5);
    assert.ok(tags.every((tag) => tag === 'BUTTON'));
  });
});

test('Host 故障提供重试和恢复入口，恢复页说明影响范围', async () => {
  await withPage(async (page) => {
    await page.locator('[data-view="offline"]').click();
    await assert.doesNotReject(() => page.getByRole('button', { name: '重试连接' }).waitFor());
    await page.getByRole('button', { name: '使用恢复密钥' }).click();
    await assert.doesNotReject(() => page.getByText('恢复后需要为这个密码组设置新密码').waitFor());
    await assert.doesNotReject(() => page.getByText('安全评审、供应商风险清单及另外 2 个对话', { exact: true }).waitFor());
  });
});

test('390px 窄屏下解锁弹窗完整位于可视区域内', async () => {
  await withPage(async (page) => {
    await page.locator('[data-view="unlock"]').click();
    const box = await page.locator('[data-unlock-dialog] .vault-dialog').boundingBox();
    assert.ok(box);
    assert.ok(box.y >= 0);
    assert.ok(box.y + box.height <= 844);
    assert.ok(box.x >= 0);
    assert.ok(box.x + box.width <= 390);
  }, { width: 390, height: 844 });
});
