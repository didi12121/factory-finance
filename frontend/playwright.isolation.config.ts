import { defineConfig, devices } from '@playwright/test'

/**
 * 环境隔离 E2E（Phase 0.3 Task B2）：对**生产构建**与**staging 构建**分别起
 * preview，以真实浏览器断言演示/原型内容在非允许清单 mode 下不可用。
 *
 * 端口复用 E2E_PORT 环境变量机制（同 playwright.config.ts）：
 *   生产 preview = E2E_PORT（默认 4172）
 *   staging preview = E2E_PORT + 2（默认 4174，避开 4173 主套件默认口 / 4175 prod 套件口）
 * 并行期用法：$env:E2E_PORT='4172'; npx playwright test -c playwright.isolation.config.ts
 *
 * 构建产物隔离目录（test-results/ 已在 .gitignore）：
 *   test-results/isolation-build/production、test-results/isolation-build/staging
 * 两个 webServer 并行构建互不覆盖 dist。
 */
const E2E_PORT = Number(process.env.E2E_PORT ?? 4172)
const PROD_PORT = E2E_PORT
const STAGING_PORT = E2E_PORT + 2

const prodUrl = `http://127.0.0.1:${PROD_PORT}`
const stagingUrl = `http://127.0.0.1:${STAGING_PORT}`

const PROD_OUT = 'test-results/isolation-build/production'
const STAGING_OUT = 'test-results/isolation-build/staging'

export default defineConfig({
  testDir: './e2e',
  testMatch: /isolation\.spec\.ts/,
  outputDir: './test-results/isolation-e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `npx vite build --outDir ${PROD_OUT} && npx vite preview --outDir ${PROD_OUT} --host 127.0.0.1 --port ${PROD_PORT} --strictPort`,
      url: prodUrl,
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      command: `npx vite build --mode staging --outDir ${STAGING_OUT} && npx vite preview --outDir ${STAGING_OUT} --host 127.0.0.1 --port ${STAGING_PORT} --strictPort`,
      url: stagingUrl,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
  projects: [
    {
      name: 'production-build',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: prodUrl },
    },
    {
      name: 'staging-build',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: stagingUrl },
    },
  ],
})
