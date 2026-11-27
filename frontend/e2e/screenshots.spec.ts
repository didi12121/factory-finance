import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

/**
 * Phase 0.2 交付截图（真实浏览器、最终集成版本、交互生成业务状态）。
 * 输出：artifacts/screenshots/phase-0.3/（Phase 0.1.1/0.2 历史证据受保护，不再由本套件覆盖）。
 *
 * Phase 0.3 采集修正：fullPage 截图统一在 scrollTop=0 状态下采集 ——
 * sticky Header 的视口位置随滚动偏移，滚动态直接 fullPage 会把 Header
 * 拼接到页面中部（截图采集伪影；判定证据见 layout-audit.spec.ts）。
 */
const outputDir = fileURLToPath(new URL('../../artifacts/screenshots/phase-0.3/', import.meta.url))

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
}

const shot = (name: string): string => path.join(outputDir, name)

/** fullPage 截图统一采集：先回页首消除 sticky Header 拼接伪影，再整页截图 */
async function shotFullPage(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(120)
  await page.screenshot({ path: shot(name), fullPage: true })
}

test.describe('Phase 0.2 截图（真实浏览器）', () => {
  test.beforeAll(() => {
    mkdirSync(outputDir, { recursive: true })
  })

  test('dashboard 四档视口截图', async ({ page }) => {
    const shots = [
      { w: 1920, h: 1080, name: 'dashboard-1920x1080.png' },
      { w: 1440, h: 900, name: 'dashboard-1440x900.png' },
      { w: 1280, h: 800, name: 'dashboard-1280x800.png' },
      { w: 390, h: 844, name: 'dashboard-mobile.png' },
    ]
    for (const s of shots) {
      await page.setViewportSize({ width: s.w, height: s.h })
      await page.goto('/workbench')
      await settle(page)
      await expect(page.getByTestId('metric-fund-balance')).toBeVisible()
      await shotFullPage(page, s.name)
    }
  })

  test('dashboard 自定义日期范围截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/workbench')
    await settle(page)
    await page.getByTestId('date-preset-custom').click()
    await page.getByTestId('date-custom-from').fill('2026-11-01')
    await page.getByTestId('date-custom-to').fill('2026-11-30')
    await expect(page.getByTestId('trend-chart')).toBeVisible()
    await settle(page)
    await shotFullPage(page, 'dashboard-custom-date.png')
  })

  test('transactions 列表 / 详情 / 空数据截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/treasury/transactions')
    await settle(page)
    await expect(page.getByTestId('transactions-table')).toBeVisible()
    await shotFullPage(page, 'transactions-list.png')

    // 详情（真实操作打开）
    await page
      .getByTestId('transactions-table')
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: /详情/ })
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await settle(page)
    await page.screenshot({ path: shot('transaction-detail.png') })
    await page.keyboard.press('Escape')

    // 空数据（真实筛选）
    const search = page.getByPlaceholder('搜索流水编号、交易对手或备注…')
    await search.fill('不存在的关键字')
    await expect(page.getByTestId('data-table-empty')).toBeVisible()
    await shotFullPage(page, 'transactions-empty.png')
    await page.getByTestId('clear-filters').click()
  })

  test('receivables 列表 / 详情 / 创建 / 空数据 / 移动端截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/receivables')
    await settle(page)
    await expect(page.getByTestId('receivables-table')).toBeVisible()
    await shotFullPage(page, 'receivables-list.png')

    // 应收单详情（真实点击进入）
    await page
      .getByTestId('receivables-table')
      .locator('tbody tr', { hasText: 'AR-2026-0004' })
      .getByTestId('row-detail')
      .click()
    await expect(page.getByTestId('receivable-detail-page')).toBeVisible()
    await settle(page)
    await shotFullPage(page, 'receivable-detail.png')
    await page.getByTestId('back-to-list').click()

    // 创建应收单（真实表单填写状态）
    await page.getByTestId('create-receivable-open').click()
    await page.getByLabel('客户', { exact: true }).click()
    await page.getByRole('option', { name: /示例客户 A/ }).click()
    await page.getByLabel('所属月份', { exact: true }).fill('2026-12')
    await page.getByLabel('对账日期').fill('2026-12-05')
    await page.locator('#create-amount').fill('10,000.00')
    await settle(page)
    await shotFullPage(page, 'create-receivable.png')
    await page.keyboard.press('Escape')

    // 空数据（真实筛选）
    await page.getByPlaceholder('搜索单据编号或客户…').fill('不存在的关键字')
    await expect(page.getByTestId('receivables-table').locator('tbody tr')).toHaveCount(1)
    await shotFullPage(page, 'receivables-empty.png')
    await page.getByTestId('filter-clear').click()

    // 移动端
    await page.setViewportSize({ width: 390, height: 844 })
    await settle(page)
    await shotFullPage(page, 'receivables-mobile.png')
  })

  test('receipts 列表 / 核销交互四态截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/processing-fee')
    await settle(page)
    await expect(page.getByTestId('receipt-list-table')).toBeVisible()
    await shotFullPage(page, 'receipt-list.png')

    // 核销分配（登记 + 自动分配）
    await page.getByTestId('open-registration').click()
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: /示例客户 A/ }).click()
    await page.getByLabel(/实际收款金额/).fill('15000.00')
    await page.getByTestId('auto-allocate').click()
    await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')
    await settle(page)
    await shotFullPage(page, 'receipt-allocation.png')

    // 校验错误态（真实超额分配）
    await page.getByLabel(/实际收款金额/).fill('1000.00')
    await page.locator('#allocation-input-ar-001').fill('8000.00')
    await expect(page.getByTestId('allocation-errors')).toContainText('核销总额超过实际收款金额')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()
    await settle(page)
    await shotFullPage(page, 'receipt-allocation-error.png')

    // 成功态（真实确认：表单确认 → 弹窗二次确认）
    await page.getByLabel(/实际收款金额/).fill('15000.00')
    await page.getByTestId('clear-allocations').click()
    await page.getByTestId('auto-allocate').click()
    await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')
    await page.getByTestId('confirm-receipt').click()
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await expect(page.getByTestId('receipt-result')).toBeVisible()
    await settle(page)
    await shotFullPage(page, 'receipt-allocation-success.png')
  })

  test('receipt 核销移动端截图', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/business/processing-fee')
    await settle(page)
    await page.getByTestId('open-registration').click()
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: /示例客户 A/ }).click()
    await page.getByLabel(/实际收款金额/).fill('15000.00')
    await page.getByTestId('auto-allocate').click()
    await expect(page.getByTestId('allocation-cards')).toBeVisible()
    await settle(page)
    await shotFullPage(page, 'receipt-allocation-mobile.png')
  })
})
