import { defineConfig, devices } from '@playwright/test'

/**
 * 视觉回归候选基线配置（CANDIDATE 阶段，独立于主套件）。
 *
 * - 固定 Locale / Timezone / Viewport（每用例内设定）/ 浏览器版本（Playwright 1.65.1 锁定）；
 * - 仅运行 visual.spec.ts；主套件（playwright.config.ts）不包含视觉比对，避免
 *   未批准的跨平台基线阻断开发测试；
 * - 生成基线：npx playwright test -c playwright.visual.config.ts --update-snapshots
 * - 验证比对：npm run test:visual
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /visual\.spec\.ts/,
  outputDir: './test-results-visual',
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: {
      // 保持默认严格阈值：禁止为消除差异放宽
      maxDiffPixelRatio: 0,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 4176)}`,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  webServer: {
    command: `npm run build:test && npm run preview -- --host 127.0.0.1 --port ${Number(process.env.E2E_PORT ?? 4176)} --strictPort`,
    url: `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 4176)}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [{ name: 'visual-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
