import { expect, test, type Page } from '@playwright/test'

/**
 * 视觉回归候选基线（CANDIDATE_BASELINE，Phase 0.3）。
 *
 * 机制：Playwright `toHaveScreenshot()` 标准快照比对（仓库规范目录
 * `e2e/visual.spec.ts-snapshots/<name>-<platform>.png`）。
 *
 * 确定性保障：
 * - 浏览器/字体固定：Playwright 1.65.1 锁定 Chromium；字体为本地 npm 字体包；
 * - Viewport / Locale / Timezone 固定（playwright.visual.config.ts：zh-CN / Asia/Shanghai）；
 * - 确定性演示数据 + 演示业务日期 DEMO_TODAY；
 * - 截图前等待真实渲染（fonts.ready + 图表渲染 + 稳定），scrollTop=0（sticky+fullPage 伪影修正）；
 * - 动画禁用（animations: 'disabled' + transitions 关闭）。
 *
 * ⚠ 本套件基线由开发平台（Windows/Chromium）生成，标记为 CANDIDATE——
 * 须经架构师与产品负责人审核后方为 APPROVED_BASELINE；跨平台字体渲染差异
 * 属预期，禁止为消除差异而放宽阈值或批量更新快照。
 */

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(500)
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  })
  await page.waitForTimeout(200)
}

test.describe('视觉回归候选基线（CANDIDATE）', () => {
  test('dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/workbench')
    await settle(page)
    await expect(page).toHaveScreenshot('dashboard.png')
  })

  test('transactions-list', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/treasury/transactions')
    await settle(page)
    await expect(page).toHaveScreenshot('transactions-list.png')
  })

  test('transaction-detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/treasury/transactions')
    await page
      .getByTestId('transactions-table')
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: /详情/ })
      .click()
    await page.getByRole('dialog').waitFor()
    await settle(page)
    await expect(page).toHaveScreenshot('transaction-detail.png')
  })

  test('receivables-list', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/receivables')
    await settle(page)
    await expect(page).toHaveScreenshot('receivables-list.png')
  })

  test('receivable-detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/receivables')
    await page
      .getByTestId('receivables-table')
      .locator('tbody tr', { hasText: 'AR-2026-0004' })
      .getByTestId('row-detail')
      .click()
    await page.getByTestId('receivable-detail-page').waitFor()
    await settle(page)
    await expect(page).toHaveScreenshot('receivable-detail.png')
  })

  test('create-receivable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/receivables')
    await page.getByTestId('create-receivable-open').click()
    await page.getByLabel('客户', { exact: true }).click()
    await page.getByRole('option', { name: /示例客户 A/ }).click()
    await page.getByLabel('所属月份', { exact: true }).fill('2026-11')
    await page.getByLabel('对账日期').fill('2026-11-25')
    await page.locator('#create-amount').fill('10,000.00')
    await settle(page)
    await expect(page).toHaveScreenshot('create-receivable.png')
    await page.keyboard.press('Escape')
  })

  test('receipt-list', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/processing-fee')
    await settle(page)
    await expect(page).toHaveScreenshot('receipt-list.png')
  })

  test('receipt-allocation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/processing-fee')
    await page.getByTestId('open-registration').click()
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: /示例客户 A/ }).click()
    await page.getByLabel(/实际收款金额/).fill('15000.00')
    await page.getByTestId('auto-allocate').click()
    await page.getByTestId('summary-unallocated').waitFor()
    await settle(page)
    await expect(page).toHaveScreenshot('receipt-allocation.png')
  })

  test('receipt-allocation-error', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/processing-fee')
    await page.getByTestId('open-registration').click()
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: /示例客户 A/ }).click()
    await page.getByLabel(/实际收款金额/).fill('1000.00')
    await page.locator('#allocation-input-ar-001').fill('8000.00')
    await page.getByTestId('allocation-errors').waitFor()
    await settle(page)
    await expect(page).toHaveScreenshot('receipt-allocation-error.png')
  })

  test('receipt-allocation-success', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/processing-fee')
    await page.getByTestId('open-registration').click()
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: /示例客户 A/ }).click()
    await page.getByLabel(/实际收款金额/).fill('15000.00')
    await page.getByTestId('auto-allocate').click()
    await page.getByTestId('confirm-receipt').click()
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await page.getByTestId('receipt-result').waitFor()
    await settle(page)
    await expect(page).toHaveScreenshot('receipt-allocation-success.png')
  })

  test('dashboard-mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/workbench')
    await settle(page)
    await expect(page).toHaveScreenshot('dashboard-mobile.png')
  })

  test('receivables-mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/business/receivables')
    await settle(page)
    await expect(page).toHaveScreenshot('receivables-mobile.png')
  })

  test('receipt-allocation-mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/business/processing-fee')
    await page.getByTestId('open-registration').click()
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: /示例客户 A/ }).click()
    await page.getByLabel(/实际收款金额/).fill('15000.00')
    await page.getByTestId('auto-allocate').click()
    await page.getByTestId('allocation-cards').waitFor()
    await settle(page)
    await expect(page).toHaveScreenshot('receipt-allocation-mobile.png')
  })
})
