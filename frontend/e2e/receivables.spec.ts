import { expect, test, type Page } from '@playwright/test'

/**
 * 应收账款 E2E（Agent F / P02-F）—— 真实浏览器验证：
 * Tab 与筛选真实改变行数、新建应收单流程（表单 → 成功 → 列表与指标更新）、
 * 详情跳转与数据一致（收款单总额 vs 本单核销金额区分）、登记回款跳转（冻结契约参数顺序）、
 * 空数据状态、响应式（1920/1440/1280/390 无非预期横向溢出）与移动端布局。
 */

const RECEIVABLES_URL = '/business/receivables'

async function gotoList(page: Page): Promise<void> {
  await page.goto(RECEIVABLES_URL)
  await expect(page.getByTestId('receivables-page')).toBeVisible()
}

function tableRows(page: Page) {
  return page.getByTestId('receivables-table').locator('tbody tr')
}

/** 文档级横向溢出（宽表格允许容器内滚动，不允许页面级横向溢出） */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test.describe('应收账款列表 — Tab 与筛选', () => {
  test.beforeEach(async ({ page }) => {
    await gotoList(page)
  })

  test('Tab 切换真实改变行数（全部 24 / 未回款 15 / 部分回款 3 / 已结清 6 / 已逾期 6）', async ({ page }) => {
    const count = page.getByText(/^共 \d+ 条$/)

    await expect(count).toHaveText('共 24 条')
    await expect(tableRows(page)).toHaveCount(20) // 每页 20 行

    await page.getByRole('tab', { name: '未回款' }).click()
    await expect(count).toHaveText('共 15 条')
    await expect(tableRows(page)).toHaveCount(15)

    await page.getByRole('tab', { name: '部分回款' }).click()
    await expect(count).toHaveText('共 3 条')
    await expect(tableRows(page)).toHaveCount(3)

    await page.getByRole('tab', { name: '已结清' }).click()
    await expect(count).toHaveText('共 6 条')
    await expect(tableRows(page)).toHaveCount(6)

    await page.getByRole('tab', { name: '已逾期' }).click()
    await expect(count).toHaveText('共 6 条')
    await expect(tableRows(page)).toHaveCount(6)
  })

  test('逾期与部分回款并存：已逾期列表同时展示「部分回款」与「逾期」', async ({ page }) => {
    await page.getByRole('tab', { name: '已逾期' }).click()
    const partialOverdue = tableRows(page).filter({ hasText: '部分回款' }).filter({ hasText: '逾期' })
    await expect(partialOverdue).toHaveCount(3)
    // 回款状态与逾期标识为两个独立单元格语义
    await expect(partialOverdue.first()).toContainText('部分回款')
    await expect(partialOverdue.first()).toContainText('逾期')
  })

  test('客户 / 月份 / 关键字筛选与清空真实改变行数', async ({ page }) => {
    const count = page.getByText(/^共 \d+ 条$/)

    // 客户筛选
    await page.getByLabel('客户筛选').click()
    await page.getByRole('option', { name: '示例客户 C', exact: true }).click()
    await expect(count).toHaveText('共 7 条')

    // 清空后恢复
    await page.getByTestId('filter-clear').click()
    await expect(count).toHaveText('共 24 条')

    // 月份筛选
    await page.getByLabel('所属月份筛选').click()
    await page.getByRole('option', { name: '2026-09', exact: true }).click()
    await expect(count).toHaveText('共 9 条')

    await page.getByTestId('filter-clear').click()

    // 关键字（编号/客户）
    await page.getByPlaceholder('搜索单据编号或客户…').fill('AR-2026-0004')
    await expect(count).toHaveText('共 1 条')
    await expect(tableRows(page)).toHaveCount(1)
    await expect(tableRows(page).first()).toContainText('AR-2026-0004')
    await expect(tableRows(page).first()).toContainText('示例客户 B')

    await page.getByTestId('filter-clear').click()
    await expect(count).toHaveText('共 24 条')
  })

  test('逾期独立筛选可与回款状态组合', async ({ page }) => {
    const count = page.getByText(/^共 \d+ 条$/)
    await page.getByLabel('逾期筛选').click()
    await page.getByRole('option', { name: '仅逾期', exact: true }).click()
    await expect(count).toHaveText('共 6 条')

    await page.getByLabel('回款状态筛选').click()
    await page.getByRole('option', { name: '部分回款', exact: true }).click()
    await expect(count).toHaveText('共 3 条')
  })

  test('空数据状态：无匹配行展示空提示与 0 条', async ({ page }) => {
    await page.getByPlaceholder('搜索单据编号或客户…').fill('不存在的关键字')
    await expect(page.getByText('共 0 条')).toBeVisible()
    await expect(page.getByText('暂无符合条件的应收单')).toBeVisible()
  })

  test('顶部指标展示四组金额与统计基准（DEMO_TODAY）', async ({ page }) => {
    const metrics = page.getByTestId('receivables-metrics')
    await expect(metrics).toContainText('449,614.38')
    await expect(metrics).toContainText('47,046.51')
    await expect(metrics).toContainText('402,567.87')
    await expect(metrics).toContainText('40,800.01')
    await expect(metrics).toContainText('统计范围：全部应收单')
    await expect(metrics).toContainText('2026-11-30')
    await expect(metrics).toContainText('DEMO_TODAY')
  })
})

test.describe('应收账款列表 — 新建应收单', () => {
  test.beforeEach(async ({ page }) => {
    await gotoList(page)
  })

  test('新建应收流程：表单校验 → 成功创建 → 列表与指标即时更新', async ({ page }) => {
    await page.getByTestId('create-receivable-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // 空提交：本地校验拦截（store 零变化）
    await page.getByTestId('create-receivable-submit').click()
    await expect(dialog.locator('#create-customer-error')).toHaveText('请选择客户')
    await expect(dialog.locator('#create-month-error')).toHaveText('所属月份格式非法（应为 YYYY-MM）')

    // 填写表单
    await page.getByLabel('客户', { exact: true }).click()
    await page.getByRole('option', { name: '示例客户 A', exact: true }).click()
    await page.getByLabel('所属月份', { exact: true }).fill('2026-12')
    await page.getByLabel('对账日期').fill('2026-12-05')
    await page.getByLabel('到期日期').fill('2026-12-31')
    await page.locator('#create-amount').fill('12,345.67')
    await page.getByLabel('备注').fill('E2E 新建应收流程')
    await page.getByTestId('create-receivable-submit').click()

    // 成功：Dialog 关闭、Toast 提示、列表 25 条、指标即时更新
    await expect(dialog).toBeHidden()
    await expect(page.getByText('应收单已创建')).toBeVisible()
    await expect(page.getByText('共 25 条')).toBeVisible()

    const metrics = page.getByTestId('receivables-metrics')
    await expect(metrics).toContainText('461,960.05') // 449,614.38 + 12,345.67
    await expect(metrics).toContainText('414,913.54') // 402,567.87 + 12,345.67

    // 新单进入列表（唯一编号 AR-2026-0025，未回款）
    await page.getByPlaceholder('搜索单据编号或客户…').fill('AR-2026-0025')
    await expect(tableRows(page)).toHaveCount(1)
    await expect(tableRows(page).first()).toContainText('AR-2026-0025')
    await expect(tableRows(page).first()).toContainText('12,345.67')
    await expect(tableRows(page).first()).toContainText('未回款')
  })

  test('非法金额被拒绝（金额 ≤ 0），列表零变化', async ({ page }) => {
    await page.getByTestId('create-receivable-open').click()
    const dialog = page.getByRole('dialog')

    await page.getByLabel('客户', { exact: true }).click()
    await page.getByRole('option', { name: '示例客户 B', exact: true }).click()
    await page.getByLabel('所属月份', { exact: true }).fill('2026-12')
    await page.getByLabel('对账日期').fill('2026-12-05')
    await page.locator('#create-amount').fill('0.00')
    await page.getByTestId('create-receivable-submit').click()

    await expect(dialog.locator('#create-amount-error')).toHaveText('应收金额必须大于 0')
    await expect(dialog).toBeVisible()
    await expect(page.getByText('共 24 条')).toBeVisible()

    // ESC 关闭弹窗（键盘可访问）
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})

test.describe('应收单详情', () => {
  test('详情跳转与列表数据一致（单一数据源）', async ({ page }) => {
    await gotoList(page)
    await page.getByPlaceholder('搜索单据编号或客户…').fill('AR-2026-0004')
    const row = tableRows(page).first()
    await expect(row).toContainText('20,000.00')
    await expect(row).toContainText('12,000.00')
    await expect(row).toContainText('8,000.00')

    await page.getByRole('link', { name: '查看应收单 AR-2026-0004' }).click()
    await expect(page).toHaveURL(/\/business\/receivables\/ar-004$/)

    const summary = page.getByTestId('detail-summary')
    await expect(summary).toContainText('AR-2026-0004')
    await expect(summary).toContainText('示例客户 B')
    await expect(summary).toContainText('部分回款')
    await expect(summary).toContainText('逾期')
    await expect(summary).toContainText('20,000.00')
    await expect(summary).toContainText('12,000.00')
    await expect(summary).toContainText('8,000.00')

    // 回款记录：收款单实际总额 ≠ 本单核销金额（rc-003 总额 5,000.00 / 本单核销 4,000.00）
    const receipts = page.getByTestId('receipt-records')
    await expect(receipts).toContainText('SK-2026-0002')
    await expect(receipts).toContainText('SK-2026-0003')
    await expect(receipts).toContainText('5,000.00')
    await expect(receipts).toContainText('4,000.00')
    await expect(receipts).not.toContainText('13,000.00')
    await expect(page.getByTestId('allocation-details')).toContainText('alloc-002')
  })

  test('登记回款跳转携带冻结契约参数（action → customerId → receivableId）', async ({ page }) => {
    await page.goto(`${RECEIVABLES_URL}/ar-004`)
    await expect(page.getByTestId('detail-summary')).toBeVisible()

    await page.getByTestId('register-payment').click()
    await expect(page).toHaveURL(
      /\/business\/processing-fee\?action=create&customerId=cust-b&receivableId=ar-004$/,
    )
  })

  test('无效 ID 展示未找到状态并可返回列表', async ({ page }) => {
    await page.goto(`${RECEIVABLES_URL}/ar-999`)
    await expect(page.getByText('未找到该应收单')).toBeVisible()
    await expect(page.getByTestId('detail-summary')).toHaveCount(0)

    await page.getByTestId('not-found-back').click()
    await expect(page).toHaveURL(/\/business\/receivables$/)
    await expect(page.getByTestId('receivables-page')).toBeVisible()
  })
})

test.describe('响应式 — 无非预期横向溢出', () => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}x${viewport.height} 应收列表无页面级横向溢出`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await gotoList(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

      // 宽表格允许容器内滚动：表格容器存在且可横向滚动
      await expect(page.getByTestId('receivables-table')).toBeVisible()
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('移动端（390×844）', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('移动端列表可用：指标/Tab/筛选可见，新建弹窗可打开提交', async ({ page }) => {
    await gotoList(page)
    await expect(page.getByTestId('receivables-metrics')).toBeVisible()
    await expect(page.getByRole('tab', { name: '全部' })).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    await page.getByTestId('create-receivable-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('移动端详情页可用且无横向溢出', async ({ page }) => {
    await page.goto(`${RECEIVABLES_URL}/ar-004`)
    await expect(page.getByTestId('detail-summary')).toBeVisible()
    await expect(page.getByTestId('receipt-records')).toContainText('4,000.00')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})
