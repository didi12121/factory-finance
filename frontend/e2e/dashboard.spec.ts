import { expect, test } from '@playwright/test'

/**
 * 经营概览（Dashboard）E2E：真实浏览器验证。
 * 断言真实数值/行数/图表数据/computed style/导航/空数据/响应式无溢出。
 */

test.describe('经营概览 Dashboard', () => {
  test('加载：核心指标、图表与近期动态', async ({ page }) => {
    await page.goto('/workbench')

    await expect(page.locator('[data-testid="demo-mode-banner"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()

    // 核心指标数值（formatAmount：千分位 + 两位小数）
    await expect(page.locator('[data-testid="metric-fund-balance"] .text-metric')).toHaveText('77,661.45')
    await expect(page.locator('[data-testid="metric-receivables-link"] .text-metric')).toHaveText('402,567.87')
    await expect(page.locator('[data-testid="metric-income"] .text-metric')).toHaveText('99,278.32')
    await expect(page.locator('[data-testid="metric-receipts"] .text-metric')).toHaveText('37,246.01')
    await expect(page.locator('[data-testid="metric-expenses"] .text-metric')).toHaveText('43,150.50')

    // 图表渲染（本月：趋势 9 个数据点 / 支出 4 个分类）
    await expect(page.locator('[data-testid="trend-chart"]')).toBeVisible()
    await expect(page.locator('[data-testid="trend-chart"]')).toHaveAttribute('data-points', '9')
    await expect(page.locator('[data-testid="expense-chart"]')).toBeVisible()
    await expect(page.locator('[data-testid="expense-chart"]')).toHaveAttribute('data-categories', '4')

    // 近期动态（展示层各 ≤ 8 条，底部「查看全部」入口）
    await expect(page.locator('[data-testid="recent-transactions"]')).toBeVisible()
    await expect(page.locator('[data-testid="pending-receivables"]')).toBeVisible()
    await expect(page.locator('[data-testid="recent-transaction-row"]')).toHaveCount(8)
    await expect(page.locator('[data-testid="pending-receivable-row"]')).toHaveCount(8)
    await expect(page.locator('[data-testid="view-all-transactions"]')).toBeVisible()
    await expect(page.locator('[data-testid="view-all-receivables"]')).toBeVisible()
  })

  test('核心金额 28px computed style', async ({ page }) => {
    await page.goto('/workbench')
    const metricValue = page.locator('[data-testid="metric-fund-balance"] .text-metric')
    await expect(metricValue).toHaveCSS('font-size', '28px')
  })

  test('日期筛选真实改变指标与图表（上月）', async ({ page }) => {
    await page.goto('/workbench')
    await expect(page.locator('[data-testid="metric-income"] .text-metric')).toHaveText('99,278.32')
    await expect(page.locator('[data-testid="trend-chart"]')).toHaveAttribute('data-points', '9')
    await expect(page.locator('[data-testid="expense-chart"]')).toHaveAttribute('data-categories', '4')

    await page.locator('[data-testid="date-preset-lastMonth"]').click()

    // 期间发生额真实改变
    await expect(page.locator('[data-testid="metric-income"] .text-metric')).toHaveText('290,801.16')
    await expect(page.locator('[data-testid="metric-receipts"] .text-metric')).toHaveText('9,800.50')
    await expect(page.locator('[data-testid="metric-expenses"] .text-metric')).toHaveText('29,234.56')
    // 图表数据真实改变
    await expect(page.locator('[data-testid="trend-chart"]')).toHaveAttribute('data-points', '4')
    await expect(page.locator('[data-testid="expense-chart"]')).toHaveAttribute('data-categories', '2')
    // 余额口径不随期间筛选变化
    await expect(page.locator('[data-testid="metric-fund-balance"] .text-metric')).toHaveText('77,661.45')
  })

  test('导航跳转：应收余额 / 待收单据 / 近期流水 / 新建记录 / 查看全部', async ({ page }) => {
    // 应收余额 → /business/receivables
    await page.goto('/workbench')
    await page.locator('[data-testid="metric-receivables-link"]').click()
    await expect(page).toHaveURL(/\/business\/receivables$/)

    // 待收单据 → /business/receivables/:id
    await page.goto('/workbench')
    await page.locator('[data-testid="pending-receivable-row"]').first().click()
    await expect(page).toHaveURL(/\/business\/receivables\/ar-\d+/)

    // 近期流水 → /treasury/transactions
    await page.goto('/workbench')
    await page.locator('[data-testid="recent-transaction-row"]').first().click()
    await expect(page).toHaveURL(/\/treasury\/transactions/)

    // 每列底部「查看全部 →」→ 业务列表（冻结路由）
    await page.goto('/workbench')
    await page.locator('[data-testid="view-all-transactions"]').click()
    await expect(page).toHaveURL(/\/treasury\/transactions/)
    await page.goto('/workbench')
    await page.locator('[data-testid="view-all-receivables"]').click()
    await expect(page).toHaveURL(/\/business\/receivables$/)

    // 新建记录 → /business/processing-fee?action=create（冻结契约）
    await page.goto('/workbench')
    await page.locator('[data-testid="new-record-trigger"]').click()
    await page.getByText('加工费回款登记').click()
    await expect(page).toHaveURL(/\/business\/processing-fee\?action=create/)
  })

  test('空数据状态（自定义区间无发生额）', async ({ page }) => {
    await page.goto('/workbench')
    await expect(page.locator('[data-testid="metric-fund-balance"]')).toBeVisible()

    await page.locator('[data-testid="date-preset-custom"]').click()
    await page.locator('[data-testid="date-custom-from"]').fill('2026-01-01')
    await page.locator('[data-testid="date-custom-to"]').fill('2026-01-31')

    // 图表空数据用共享 EmptyState
    await expect(page.getByText('暂无收付数据')).toBeVisible()
    await expect(page.getByText('暂无支出数据')).toBeVisible()
    await expect(page.locator('[data-testid="trend-chart"]')).toHaveCount(0)
    // 期间发生额为 0；余额口径不变
    await expect(page.locator('[data-testid="metric-income"] .text-metric')).toHaveText('0.00')
    await expect(page.locator('[data-testid="metric-fund-balance"] .text-metric')).toHaveText('77,661.45')
  })

  test('桌面断点 1920/1440/1280 无横向溢出', async ({ page }) => {
    for (const width of [1920, 1440, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/workbench')
      await expect(page.locator('[data-testid="metric-fund-balance"]')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `width=${width} 出现横向溢出`).toBeLessThanOrEqual(0)
    }
  })

  test('移动端布局（390）无横向溢出且指标可见', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/workbench')
    await expect(page.locator('[data-testid="metric-fund-balance"]')).toBeVisible()
    await expect(page.locator('[data-testid="metric-expenses"]')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
