import { existsSync } from 'node:fs'
import { defineConfig } from 'playwright/test'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.DSH_E2E_BROWSER_EXECUTABLE
  ?? (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined)

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    browserName: 'chromium',
    headless: true,
    locale: 'zh-CN',
    launchOptions: executablePath === undefined ? {} : { executablePath },
    // Vault flows handle credentials and one-time recovery material. Never
    // persist browser traces or screenshots that could capture those values.
    trace: 'off',
    screenshot: 'off',
  },
})
