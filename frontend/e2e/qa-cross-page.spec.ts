import { expect, test, type Page } from '@playwright/test'

/**
 * Agent H 独立集成测试（QA 强制跨页面场景）—— 真实浏览器、同一会话、同一 Store 状态。
 *
 * S1（强制场景）：回款页登记 15,000.00 并核销 ar-001=8,000.00 / ar-002=7,000.00 后，
 * 在**不刷新页面**（SPA 侧边栏导航，窗口会话标记为证）的前提下依次断言
 * 收款单列表 / 应收账款 / 应收单 A 详情 / 应收单 B 详情 / 资金流水 / 经营概览六处数据一致。
 *
 * S2–S6（附加集成场景，确定性 fixtures，每个测试独立全新会话）：
 * 创建应收、同一应收两次回款、无效分配失败零变化、重复确认仅一笔、内部转账净零。
 *
 * S7（生产构建隔离）不跑在本配置（演示路由在测试构建可用属预期）：
 * 由 `npm run test:e2e:prod`（prod-guard.spec.ts，/dev/design-system 守卫）+
 * QA 报告中的 dist 产物扫描（演示 Fixtures 特征字符串）与独立 prod 预览脚本验证，
 * 结论记录于 docs/reviews/PHASE_0_2_QA_REPORT.md（production_isolation 一节）。
 *
 * 说明：跨客户核销 / 无效账户 / 重复分配在 UI 层不可构造（核销行按所选客户过滤、
 * 账户下拉仅启用账户、每张应收单仅一个分配输入框），其拒绝由 Store/Domain 层兜底
 * （allocation.test.ts / store.test.ts / receipts-guard.test.ts），本文件在 S4 中
 * 断言对应 UI 防护面（跨客户路由预填被拒、停用账户不可选）并做失败前后逐字段快照比对。
 */

const RECEIPTS_URL = '/business/processing-fee'
const RECEIVABLES_URL = '/business/receivables'
const TREASURY_URL = '/treasury/transactions'

/* ------------------------------- 会话与导航 ------------------------------- */

/** 打上窗口会话标记：若页面被刷新/重载，该标记必然丢失（证明跨页断言在同一 Store 会话内） */
async function markSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>).__QA_SAME_SESSION__ = 'agent-h'
  })
}

async function expectSameSession(page: Page): Promise<void> {
  const marker = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__QA_SAME_SESSION__,
  )
  expect(marker).toBe('agent-h')
}

/** SPA 侧边栏导航（RouterLink，不触发整页刷新） */
async function navTo(page: Page, label: string): Promise<void> {
  await page.getByRole('link', { name: label, exact: true }).click()
  await expectSameSession(page)
}

/** 打开登记回款表单（当前会话内） */
async function openRegistration(page: Page): Promise<void> {
  await page.getByTestId('open-registration').click()
  await expect(page.locator('#receipt-registration')).toBeVisible()
}

/** 选择客户（共享 Select 真实交互） */
async function chooseCustomer(page: Page, customerName: string): Promise<void> {
  await page.getByTestId('registration-customer').click()
  await page.getByRole('option', { name: customerName }).click()
  await expect(page.getByTestId('registration-customer')).toContainText(customerName)
}

/** 确认收款（确认对话框真实点击） */
async function confirmReceipt(page: Page): Promise<void> {
  await page.getByTestId('confirm-receipt').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确认收款' }).click()
  await expect(page.getByTestId('receipt-result')).toBeVisible()
}

/* ============================ S1 强制跨页面场景 ============================ */

test.describe('S1 强制跨页面场景（同一会话、同一 Store 状态，禁止刷新）', () => {
  test('15,000.00 回款核销 ar-001=8,000 + ar-002=7,000 后六处数据一致', async ({ page }) => {
    await page.goto('/workbench')
    await markSession(page)

    // ---- 基线（fixtures 确定性：资金 77,661.45 / 应收 402,567.87 / 期间加工收入 99,278.32）----
    const fundBalance = page.getByTestId('metric-fund-balance')
    const receivableOutstanding = page.getByTestId('metric-receivables-link')
    const processingIncome = page.getByTestId('metric-income')
    await expect(fundBalance).toContainText('77,661.45')
    await expect(receivableOutstanding).toContainText('402,567.87')
    await expect(processingIncome).toContainText('99,278.32')

    // ---- 回款页：登记实际收款 15,000.00，核销 A=8,000.00 / B=7,000.00 ----
    await navTo(page, '加工费回款')
    await expect(page.getByTestId('receipt-list-table').getByText('共 8 条')).toBeVisible()
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')

    // 固定 fixtures 预置：应收单 A = ar-001（8,000.00）、应收单 B = ar-002（12,000.00）
    await expect(page.getByTestId('allocation-row-ar-001')).toContainText('8,000.00')
    await expect(page.getByTestId('allocation-row-ar-002')).toContainText('12,000.00')

    await page.locator('#actual-amount').fill('15000')
    await page.locator('#allocation-input-ar-001').fill('8000')
    await page.locator('#allocation-input-ar-002').fill('7000')
    await expect(page.getByTestId('summary-actual')).toHaveText('15,000.00')
    await expect(page.getByTestId('summary-allocated')).toHaveText('15,000.00')
    await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')

    await confirmReceipt(page)
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')
    await expect(page.getByTestId('result-transaction-no')).toContainText('FT-2026-0023')
    await expect(page.getByTestId('result-allocation-count')).toHaveText('2 笔')

    // ---- 断言 1：收款单列表（+1 张、15,000.00、已核销 15,000.00、未分配 0.00）----
    const receiptTable = page.getByTestId('receipt-list-table')
    await expect(receiptTable.getByText('共 9 条')).toBeVisible()
    const receiptRow = receiptTable.locator('tbody tr', { hasText: 'SK-2026-0009' })
    await expect(receiptRow).toHaveCount(1)
    await expect(receiptRow.locator('td').nth(4)).toHaveText('15,000.00') // 实际收款金额
    await expect(receiptRow.locator('td').nth(5)).toHaveText('15,000.00') // 已核销金额
    await expect(receiptRow.locator('td').nth(6)).toHaveText('0.00') // 未分配金额
    await expect(receiptRow).toContainText('已全额核销')

    // ---- 断言 2：应收账款（A 已结清、B 部分回款、B 未收 5,000.00）----
    await navTo(page, '应收账款')
    const receivableTable = page.getByTestId('receivables-table')
    const rowA = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0001' })
    await expect(rowA).toContainText('已结清')
    await expect(rowA.locator('td').nth(5)).toHaveText('8,000.00') // 应收金额
    await expect(rowA.locator('td').nth(6)).toHaveText('8,000.00') // 已收金额
    await expect(rowA.locator('td').nth(7)).toHaveText('0.00') // 未收金额
    const rowB = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB).toContainText('部分回款')
    await expect(rowB.locator('td').nth(5)).toHaveText('12,000.00')
    await expect(rowB.locator('td').nth(6)).toHaveText('7,000.00')
    await expect(rowB.locator('td').nth(7)).toHaveText('5,000.00') // B 未收 5,000.00

    // ---- 断言 3：应收单 A 详情（收款单总金额 15,000.00 / 本单核销 8,000.00）----
    await rowA.getByTestId('row-detail').click()
    await expect(page.getByTestId('receivable-detail-page')).toBeVisible()
    await expectSameSession(page)
    const summaryA = page.getByTestId('detail-summary')
    await expect(summaryA).toContainText('已结清')
    await expect(summaryA).toContainText('8,000.00') // 应收金额 = 已收金额
    await expect(summaryA).toContainText('0.00') // 未收金额
    await expect(summaryA).not.toContainText('15,000.00') // 本单已收 ≠ 收款单总额（红线）
    const recordsA = page.getByTestId('receipt-records')
    await expect(recordsA.getByRole('columnheader', { name: '收款单实际总额' })).toBeVisible()
    await expect(recordsA.getByRole('columnheader', { name: '本单核销金额' })).toBeVisible()
    const detailRowA = recordsA.locator('tbody tr', { hasText: 'SK-2026-0009' })
    await expect(detailRowA).toHaveCount(1)
    await expect(detailRowA.locator('td').nth(3)).toHaveText('15,000.00') // 收款单实际总额
    await expect(detailRowA.locator('td').nth(4)).toHaveText('8,000.00') // 本单核销金额

    // ---- 断言 4：应收单 B 详情（收款单总金额 15,000.00 / 本单核销 7,000.00）----
    await page.getByTestId('back-to-list').click()
    await expect(page.getByTestId('receivables-page')).toBeVisible()
    await rowB.getByTestId('row-detail').click()
    await expect(page.getByTestId('receivable-detail-page')).toBeVisible()
    const summaryB = page.getByTestId('detail-summary')
    await expect(summaryB).toContainText('部分回款')
    await expect(summaryB).toContainText('7,000.00') // 已收 = Σ 本单核销
    await expect(summaryB).toContainText('5,000.00') // 未收
    await expect(summaryB).not.toContainText('15,000.00') // 本单已收 ≠ 收款单总额（红线）
    const detailRowB = page.getByTestId('receipt-records').locator('tbody tr', { hasText: 'SK-2026-0009' })
    await expect(detailRowB).toHaveCount(1)
    await expect(detailRowB.locator('td').nth(3)).toHaveText('15,000.00') // 收款单实际总额
    await expect(detailRowB.locator('td').nth(4)).toHaveText('7,000.00') // 本单核销金额

    // ---- 断言 5：资金流水（新增资金流入 1 条、金额 15,000.00）----
    await navTo(page, '资金流水')
    const txnTable = page.getByTestId('transactions-table')
    await expect(txnTable.getByText('共 23 条')).toBeVisible() // 22 + 1
    const txnRow = txnTable.locator('tbody tr', { hasText: 'FT-2026-0023' })
    await expect(txnRow).toHaveCount(1)
    await expect(txnRow.locator('td').nth(5)).toHaveText('15,000.00') // 收入金额列（方向 IN）
    await expect(txnRow.locator('td').nth(6)).toHaveText('—') // 支出金额列（非 OUT）
    await expect(txnRow).toContainText('加工费回款')
    await expect(txnRow).toContainText('示例客户 A')
    await expect(txnRow).toContainText('收款单 SK-2026-0009')
    // 流入方向过滤：11 → 12 条（新增资金流入恰好 1 条）
    await page.getByTestId('filter-direction').click()
    await page.getByRole('option', { name: '流入（IN）' }).click()
    await expect(txnTable.getByText('共 12 条')).toBeVisible()
    await page.getByTestId('clear-filters').click()
    await expect(txnTable.getByText('共 23 条')).toBeVisible()

    // ---- 断言 6：经营概览（资金余额 +15,000.00、应收余额 −15,000.00、加工收入变化 0.00）----
    await navTo(page, '经营概览')
    await expect(page.getByTestId('metric-fund-balance')).toContainText('92,661.45') // 77,661.45 + 15,000.00
    await expect(page.getByTestId('metric-receivables-link')).toContainText('387,567.87') // 402,567.87 − 15,000.00
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32') // 加工收入变化 0.00

    // 全程同一会话（无刷新重置）
    await expectSameSession(page)
  })
})

/* ============================ S2 创建应收 ============================ */

test.describe('S2 创建应收 10,000.00', () => {
  test('应收余额 +10,000、期间加工收入 +10,000、资金余额 0 变化、收款/流水数量不变', async ({ page }) => {
    await page.goto('/workbench')
    await markSession(page)
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('402,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')

    await navTo(page, '应收账款')
    const receivableTable = page.getByTestId('receivables-table')
    await expect(receivableTable.getByText('共 24 条')).toBeVisible()

    // 创建应收单（会计期间 2026-11 → 计入期间加工收入；不产生资金流水）
    await page.getByTestId('create-receivable-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('[aria-label="客户"]').click()
    await page.getByRole('option', { name: '示例客户 A' }).click()
    await dialog.getByLabel('所属月份').fill('2026-11')
    await dialog.getByLabel('对账日期').fill('2026-11-30')
    await dialog.getByLabel('到期日期').fill('2026-12-31')
    await dialog.locator('#create-amount').fill('10000')
    await page.getByTestId('create-receivable-submit').click()
    await expect(dialog).toBeHidden()

    // 列表 +1（AR-2026-0025），金额 10,000.00
    await expect(receivableTable.getByText('共 25 条')).toBeVisible()
    const newRow = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0025' })
    await expect(newRow).toHaveCount(1)
    await expect(newRow.locator('td').nth(5)).toHaveText('10,000.00')
    await expect(newRow.locator('td').nth(7)).toHaveText('10,000.00') // 未收

    // 经营概览：应收余额 +10,000、期间加工收入 +10,000、资金余额 0 变化
    await navTo(page, '经营概览')
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45') // 不变
    await expect(page.getByTestId('metric-receivables-link')).toContainText('412,567.87') // +10,000
    await expect(page.getByTestId('metric-income')).toContainText('109,278.32') // +10,000

    // 收款单 / 资金流水数量不变
    await navTo(page, '资金流水')
    await expect(page.getByTestId('transactions-table').getByText('共 22 条')).toBeVisible()
    await navTo(page, '加工费回款')
    await expect(page.getByTestId('receipt-list-table').getByText('共 8 条')).toBeVisible()
    await expectSameSession(page)
  })
})

/* ==================== S3 同一应收两次回款（累计核销/剩余/流水数） ==================== */

test.describe('S3 同一应收两次回款', () => {
  test('ar-002 分两次回款 3,000 + 2,000：累计核销 5,000、剩余 7,000、流水 +2', async ({ page }) => {
    await page.goto(RECEIPTS_URL)
    await markSession(page)

    // 第一笔 3,000.00 → ar-002
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('3000')
    await page.locator('#allocation-input-ar-002').fill('3000')
    await confirmReceipt(page)
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')

    // 第二笔 2,000.00 → ar-002（继续登记，同一会话）
    await page.getByTestId('continue-registration').click()
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('2000')
    await page.locator('#allocation-input-ar-002').fill('2000')
    await confirmReceipt(page)
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0010')

    // 应收账款：ar-002 累计已收 5,000.00、未收 7,000.00、部分回款
    await navTo(page, '应收账款')
    const rowB = page
      .getByTestId('receivables-table')
      .locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB.locator('td').nth(6)).toHaveText('5,000.00') // 累计已收
    await expect(rowB.locator('td').nth(7)).toHaveText('7,000.00') // 剩余
    await expect(rowB).toContainText('部分回款')

    // 详情：两笔收款单分别核销 3,000.00 / 2,000.00（每笔收款单总额 = 本单核销）
    await rowB.getByTestId('row-detail').click()
    const records = page.getByTestId('receipt-records')
    const row1 = records.locator('tbody tr', { hasText: 'SK-2026-0009' })
    await expect(row1.locator('td').nth(3)).toHaveText('3,000.00')
    await expect(row1.locator('td').nth(4)).toHaveText('3,000.00')
    const row2 = records.locator('tbody tr', { hasText: 'SK-2026-0010' })
    await expect(row2.locator('td').nth(3)).toHaveText('2,000.00')
    await expect(row2.locator('td').nth(4)).toHaveText('2,000.00')

    // 资金流水 +2 条（一笔收款只记一条流入）
    await navTo(page, '资金流水')
    await expect(page.getByTestId('transactions-table').getByText('共 24 条')).toBeVisible()
    await expectSameSession(page)
  })
})

/* ============ S4 无效分配：失败前后财务数据逐字段一致（零状态变化） ============ */

test.describe('S4 无效分配失败零变化', () => {
  test('超额/累计超原额/非法金额/未分配/金额为 0 全部被拒且财务数据逐字段一致', async ({ page }) => {
    await page.goto('/workbench')
    await markSession(page)

    // 失败前快照（经营概览逐字段）
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('402,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    await expect(page.getByTestId('metric-receipts')).toContainText('37,246.01') // 期间实际回款（2026-11）
    await expect(page.getByTestId('metric-expenses')).toContainText('43,150.50') // 期间实际支出（2026-11）

    await navTo(page, '加工费回款')
    await expect(page.getByTestId('receipt-list-table').getByText('共 8 条')).toBeVisible()
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')

    // 无效账户防护：账户下拉仅启用账户（示例停用账户不可选）
    await page.getByTestId('registration-account').click()
    await expect(page.getByRole('option', { name: '示例停用账户' })).toHaveCount(0)
    await expect(page.getByRole('option', { name: '示例银行账户' })).toBeVisible()
    await page.keyboard.press('Escape')

    // ① 非法金额（1.234，超精度）：格式错误提示 + 禁止确认
    await page.locator('#actual-amount').fill('15000')
    await page.locator('#allocation-input-ar-001').fill('1.234')
    await expect(page.getByText('金额格式不正确')).toBeVisible()
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    // ② 超额核销（核销总额 > 实际收款）：错误提示 + 禁止确认
    await page.locator('#allocation-input-ar-001').fill('8000')
    await page.locator('#allocation-input-ar-002').fill('7000')
    await page.locator('#actual-amount').fill('1000')
    await expect(page.getByTestId('allocation-errors')).toContainText('核销总额超过实际收款金额')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    // ③ 累计核销超过原始应收（ar-001 原始 8,000.00 核销 9,000.00）
    await page.locator('#allocation-input-ar-002').fill('')
    await page.locator('#allocation-input-ar-001').fill('9000')
    await page.locator('#actual-amount').fill('9000')
    await expect(page.getByTestId('allocation-errors')).toContainText('累计核销金额超过应收单原始金额')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    // ④ 未分配 > 0（15,000 只分配 8,000）：Phase 2 说明 + 禁止确认
    await page.locator('#allocation-input-ar-001').fill('8000')
    await page.locator('#actual-amount').fill('15000')
    await expect(page.getByTestId('unallocated-warning')).toContainText('7,000.00')
    await expect(page.getByTestId('unallocated-warning')).toContainText('禁止确认收款')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    // ⑤ 金额为 0：核销金额必须大于 0（Store/Domain 最终防线）
    await page.locator('#allocation-input-ar-001').fill('0')
    await page.locator('#actual-amount').fill('0')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    // 失败后快照：财务数据逐字段一致（收款单/流水/应收/看板全部不变）
    await expect(page.getByTestId('receipt-list-table').getByText('共 8 条')).toBeVisible()
    await navTo(page, '应收账款')
    const rowA = page.getByTestId('receivables-table').locator('tbody tr', { hasText: 'AR-2026-0001' })
    await expect(rowA.locator('td').nth(5)).toHaveText('8,000.00')
    await expect(rowA.locator('td').nth(6)).toHaveText('0.00')
    await expect(rowA.locator('td').nth(7)).toHaveText('8,000.00')
    await expect(rowA).toContainText('未回款')
    const rowB = page.getByTestId('receivables-table').locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB.locator('td').nth(6)).toHaveText('0.00')
    await expect(rowB.locator('td').nth(7)).toHaveText('12,000.00')
    await navTo(page, '资金流水')
    await expect(page.getByTestId('transactions-table').getByText('共 22 条')).toBeVisible()
    await navTo(page, '经营概览')
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('402,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    await expect(page.getByTestId('metric-receipts')).toContainText('37,246.01')
    await expect(page.getByTestId('metric-expenses')).toContainText('43,150.50')
    await expectSameSession(page)
  })

  test('跨客户核销在 UI 层被拒绝（路由预填不误核销，核销行不含他客户应收单）', async ({ page }) => {
    // 路由预填携带 cust-b + cust-a 的应收单：应提示"不属于所选客户"并忽略（不误核销）
    await page.goto(`${RECEIPTS_URL}?action=create&customerId=cust-b&receivableId=ar-001`)
    await markSession(page)
    await expect(page.getByTestId('route-notice')).toContainText('不属于所选客户')
    await expect(page.getByTestId('registration-customer')).toContainText('示例客户 B')
    await expect(page.getByTestId('allocation-row-ar-001')).toHaveCount(0) // 跨客户应收单不进入核销表
    await expect(page.getByTestId('allocation-row-ar-004')).toBeVisible()
    await expect(page.locator('#allocation-input-ar-001')).toHaveCount(0)
  })
})

/* ==================== S5 同一操作重复确认仅一笔（幂等） ==================== */

test.describe('S5 重复确认仅一笔', () => {
  test('确认按钮双击仅生成一张收款单/一条流水，核销金额不重复', async ({ page }) => {
    await page.goto(RECEIPTS_URL)
    await markSession(page)
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('15000')
    await page.getByTestId('auto-allocate').click()
    await expect(page.locator('#allocation-input-ar-001')).toHaveValue('8000.00')
    await expect(page.locator('#allocation-input-ar-002')).toHaveValue('7000.00')

    await page.getByTestId('confirm-receipt').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // 同一操作重复确认（快速双击）
    await dialog.getByRole('button', { name: '确认收款' }).dblclick()
    await expect(page.getByTestId('receipt-result')).toBeVisible()

    // 仅一张收款单、两条核销
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')
    await expect(page.getByTestId('result-allocation-count')).toHaveText('2 笔')
    const receiptTable = page.getByTestId('receipt-list-table')
    await expect(receiptTable.getByText('共 9 条')).toBeVisible()
    await expect(receiptTable.locator('tbody tr', { hasText: 'SK-2026-0009' })).toHaveCount(1)

    // 仅一条资金流入
    await navTo(page, '资金流水')
    await expect(page.getByTestId('transactions-table').getByText('共 23 条')).toBeVisible()
    const searchInput = page.getByPlaceholder('搜索流水编号、交易对手或备注…')
    await searchInput.fill('FT-2026-0023')
    await expect(page.getByTestId('transactions-table').locator('tbody tr')).toHaveCount(1)

    // 核销金额不重复计入：ar-001 已结清 8,000.00、ar-002 未收 5,000.00
    await navTo(page, '应收账款')
    const rowA = page.getByTestId('receivables-table').locator('tbody tr', { hasText: 'AR-2026-0001' })
    await expect(rowA.locator('td').nth(6)).toHaveText('8,000.00')
    const rowB = page.getByTestId('receivables-table').locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB.locator('td').nth(7)).toHaveText('5,000.00')
    await expectSameSession(page)
  })
})

/* ==================== S6 内部转账（成对流水、整体净零） ==================== */

test.describe('S6 内部转账', () => {
  test('成对流水 OUT+IN、整体净零、不计收付趋势与费用', async ({ page }) => {
    await page.goto(TREASURY_URL)
    await markSession(page)
    const txnTable = page.getByTestId('transactions-table')

    // 业务类型筛选"内部转账"：2 组 × (OUT+IN) = 4 条成对流水
    await page.getByTestId('filter-type').click()
    await page.getByRole('option', { name: '内部转账' }).click()
    await expect(txnTable.getByText('共 4 条')).toBeVisible()

    // 整体净零：工厂整体口径排除内部转账（划转 ≠ 收支），流入/流出/净流入均不计入（0.00）
    const summary = page.getByTestId('transactions-summary')
    await expect(page.getByTestId('summary-scope')).toContainText('已排除内部转账')
    await expect(page.getByTestId('summary-count')).toContainText('命中 4 条流水，其中 0 条计入汇总')
    await expect(summary.getByText('0.00', { exact: true })).toHaveCount(3) // 资金流入/流出/净流入

    // 成对流水：tg-002 的 OUT（FT-2026-0005）详情中可见关联 IN 流水（FT-2026-0006）
    await page.getByRole('button', { name: '查看 FT-2026-0005 详情' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('流出（OUT）')
    await expect(sheet).toContainText('2,000.00')
    await expect(sheet).toContainText('tg-002')
    await expect(page.getByTestId('detail-related')).toContainText('FT-2026-0006') // 另一方向账户流水
    await expect(page.getByTestId('detail-related')).toContainText('流入（IN）')
    await sheet.getByRole('button', { name: '关闭详情面板' }).click()

    // 收入/费用不变：加工收入不含转账；期间实际支出不含内部转账（若误计应为 53,150.50）
    await navTo(page, '经营概览')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    await expect(page.getByTestId('metric-expenses')).toContainText('43,150.50')
    // 转账整体净零：资金余额 = 期初 + 外部收付（77,661.45 含成对划转净 0）
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expectSameSession(page)
  })
})

/* ==================== UI 证据截图（审核证据，非最终交付截图） ==================== */

test.describe('QA UI 证据截图（1920×1080 / 390×844）', () => {
  test('桌面端四页面 + 详情 + 登记表单截图', async ({ page }) => {
    await page.goto('/workbench')
    await markSession(page)
    await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
    await page.screenshot({ path: 'test-results/qa/ui-dashboard-1920.png', fullPage: true })

    await navTo(page, '应收账款')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
    await page.screenshot({ path: 'test-results/qa/ui-receivables-1920.png', fullPage: true })

    await page
      .getByTestId('receivables-table')
      .locator('tbody tr', { hasText: 'AR-2026-0004' })
      .getByTestId('row-detail')
      .click()
    await expect(page.getByTestId('receipt-records')).toBeVisible()
    await page.screenshot({ path: 'test-results/qa/ui-receivable-detail-1920.png', fullPage: true })

    await navTo(page, '加工费回款')
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('15000')
    await page.getByTestId('auto-allocate').click()
    await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')
    await page.screenshot({ path: 'test-results/qa/ui-receipt-registration-1920.png', fullPage: true })
    await page.getByTestId('confirm-receipt').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ path: 'test-results/qa/ui-confirm-dialog-1920.png' })
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await expect(page.getByTestId('receipt-result')).toBeVisible()
    await page.screenshot({ path: 'test-results/qa/ui-receipt-result-1920.png', fullPage: true })

    await navTo(page, '资金流水')
    await expect(page.getByTestId('transactions-table')).toBeVisible()
    await page.screenshot({ path: 'test-results/qa/ui-transactions-1920.png', fullPage: true })
    await expectSameSession(page)
  })

  test.describe('移动端 390×844', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

    test('移动端核销操作可用且四页面无非预期横向溢出', async ({ page }) => {
      // 经营概览
      await page.goto('/workbench')
      await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
      await page.screenshot({ path: 'test-results/qa/ui-dashboard-390.png', fullPage: true })
      await expectNoHorizontalOverflow(page)

      // 加工费回款（移动端核销卡片布局可完成登记）
      await page.getByTestId('mobile-nav-open').click()
      await page.getByTestId('mobile-nav').getByRole('link', { name: '加工费回款', exact: true }).click()
      await openRegistration(page)
      await chooseCustomer(page, '示例客户 A')
      await expect(page.getByTestId('allocation-cards')).toBeVisible()
      await page.locator('#actual-amount').fill('15000')
      await page.getByTestId('auto-allocate').click()
      await expect(page.locator('#allocation-input-ar-001')).toHaveValue('8000.00')
      await expect(page.locator('#allocation-input-ar-002')).toHaveValue('7000.00')
      await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')
      await page.screenshot({ path: 'test-results/qa/ui-receipt-registration-390.png', fullPage: true })
      await expectNoHorizontalOverflow(page)

      // 应收账款（宽表格容器内滚动）
      await page.getByTestId('mobile-nav-open').click()
      await page.getByTestId('mobile-nav').getByRole('link', { name: '应收账款', exact: true }).click()
      await expect(page.getByTestId('receivables-page')).toBeVisible()
      await page.screenshot({ path: 'test-results/qa/ui-receivables-390.png', fullPage: true })
      await expectNoHorizontalOverflow(page)

      // 资金流水
      await page.getByTestId('mobile-nav-open').click()
      await page.getByTestId('mobile-nav').getByRole('link', { name: '资金流水', exact: true }).click()
      await expect(page.getByTestId('transactions-table')).toBeVisible()
      await page.screenshot({ path: 'test-results/qa/ui-transactions-390.png', fullPage: true })
      await expectNoHorizontalOverflow(page)
    })
  })
})

/** 页面无非预期横向溢出（宽表格允许容器内滚动） */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
}
