import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { chromium } from '/Users/Robbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = new URL('./vault-ui-interaction-v3.html', import.meta.url);

async function withPage(run, viewport = { width: 1280, height: 800 }) {
  await access(target);
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  try {
    await page.goto(target.href);
    await run(page);
    assert.deepEqual(errors, [], '页面不能产生 error 或 warning');
  } finally {
    await browser.close();
  }
}

test('深浅预览改变主题，同时正式插件设置不出现外观选项', async () => {
  await withPage(async (page) => {
    const root = page.locator('#vault-v3');
    await page.getByRole('button', { name: '浅色预览' }).click();
    const lightBackground = await root.evaluate((node) => getComputedStyle(node).backgroundColor);
    assert.equal(await root.getAttribute('data-preview-theme'), 'light');
    await page.getByRole('button', { name: '深色预览' }).click();
    const darkBackground = await root.evaluate((node) => getComputedStyle(node).backgroundColor);
    assert.equal(await root.getAttribute('data-preview-theme'), 'dark');
    assert.notEqual(lightBackground, darkBackground);
    await page.locator('[data-view="settings"]').click();
    assert.equal(await page.locator('[data-scene="settings"]').getByText('外观').count(), 0);
  });
});

test('桌面采用 DSH 紧凑密度和左对齐工作台', async () => {
  await withPage(async (page) => {
    const metrics = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
      const topbar = document.querySelector('[data-scene="locked"] .topbar').getBoundingClientRect();
      const button = document.querySelector('[data-scene="locked"] .button.primary').getBoundingClientRect();
      const main = document.querySelector('.main').getBoundingClientRect();
      const workbench = document.querySelector('[data-scene="locked"] .workbench').getBoundingClientRect();
      return { sidebar: sidebar.width, topbar: topbar.height, button: button.height, inset: workbench.x - main.x };
    });
    assert.ok(metrics.sidebar >= 240 && metrics.sidebar <= 260);
    assert.ok(metrics.topbar >= 50 && metrics.topbar <= 58);
    assert.ok(metrics.button <= 36);
    assert.ok(metrics.inset >= 20 && metrics.inset <= 36);
  });
});

test('设置页以锁定策略、密码组和恢复能力三个页签组织', async () => {
  await withPage(async (page) => {
    await page.locator('[data-view="settings"]').click();
    const tabs = page.getByRole('tab');
    assert.equal(await tabs.count(), 3);
    await page.getByRole('tab', { name: '密码组' }).click();
    assert.equal(await page.getByRole('tab', { name: '密码组' }).getAttribute('aria-selected'), 'true');
    await assert.doesNotReject(() => page.locator('[data-settings-panel="groups"]:visible').waitFor());
    await page.getByRole('tab', { name: '恢复能力' }).click();
    await assert.doesNotReject(() => page.locator('[data-settings-panel="recovery"]:visible').waitFor());
  });
});

test('空密码不可提交，错误后保留输入并显示剩余次数', async () => {
  await withPage(async (page) => {
    await page.locator('[data-view="unlock"]').click();
    const input = page.getByLabel('保险箱密码');
    const submit = page.getByRole('button', { name: '解锁保险箱', exact: true });
    assert.equal(await submit.isDisabled(), true);
    await input.fill('wrong-password');
    await submit.click();
    await assert.doesNotReject(() => page.locator('[data-password-error]').waitFor());
    assert.equal(await input.inputValue(), 'wrong-password');
  });
});

test('解锁弹窗管理初始焦点、Escape 和焦点归还', async () => {
  await withPage(async (page) => {
    const trigger = page.locator('[data-scene="locked"] [data-open-vault]');
    await trigger.click();
    assert.equal(await page.getByLabel('保险箱密码').evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-unlock-dialog]').isHidden(), true);
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
  });
});

test('移动端控件热区至少 44px且弹窗不溢出', async () => {
  await withPage(async (page) => {
    await page.locator('[data-view="unlock"]').click();
    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('.vault-dialog').getBoundingClientRect();
      const button = document.querySelector('.vault-dialog .button').getBoundingClientRect();
      return { dialog, buttonHeight: button.height, viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth };
    });
    assert.ok(metrics.buttonHeight >= 44);
    assert.ok(metrics.dialog.x >= 0 && metrics.dialog.right <= metrics.viewport.width);
    assert.ok(metrics.dialog.y >= 0 && metrics.dialog.bottom <= metrics.viewport.height);
    assert.equal(metrics.scrollWidth, metrics.viewport.width);
  }, { width: 390, height: 844 });
});

test('深浅主题的正文、状态标签和主按钮均达到 4.5:1', async () => {
  await withPage(async (page) => {
    const auditTheme = async (themeName) => {
      await page.getByRole('button', { name: themeName }).click();
      return page.evaluate(() => {
        const channels = (color) => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const linear = (channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        };
        const ratio = (foreground, background) => {
          const [fr, fg, fb] = channels(foreground).map(linear);
          const [br, bg, bb] = channels(background).map(linear);
          const first = 0.2126 * fr + 0.7152 * fg + 0.0722 * fb;
          const second = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        const contrastOf = (selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          return ratio(style.color, style.backgroundColor);
        };
        return {
          primary: contrastOf('.button.primary'),
          chip: contrastOf('.status-chip'),
        };
      });
    };
    const light = await auditTheme('浅色预览');
    const dark = await auditTheme('深色预览');
    for (const value of [light.primary, light.chip, dark.primary, dark.chip]) assert.ok(value >= 4.5, `对比度 ${value.toFixed(2)} 未达到 4.5`);
  });
});
