import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright 端到端测试：启动真实构建的应用（含测试环境专用开关），
 * 使用真实浏览器验证交互并生成 artifacts/screenshots/phase-0.1/ 截图。
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 4173)}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build:test && npm run preview -- --host 127.0.0.1 --port ${Number(process.env.E2E_PORT ?? 4173)} --strictPort`,
    url: `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 4173)}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      testIgnore: /(?:mobile|prod-guard)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'mobile-chrome',
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
  ],
})
