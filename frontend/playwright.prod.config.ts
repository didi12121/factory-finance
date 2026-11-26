import { defineConfig, devices } from '@playwright/test'

/**
 * 生产构建验证：构建产物不含测试环境开关，
 * 验证 /dev/design-system 在生产构建下不可使用（重定向回工作台）。
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /prod-guard\.spec\.ts/,
  outputDir: './test-results-prod',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4175',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [{ name: 'prod-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
