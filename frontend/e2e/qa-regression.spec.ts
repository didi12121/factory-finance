import { expect, test, type Page } from '@playwright/test'

/**
 * Phase 0.3 Agent D 独立 QA 强制回归（真实浏览器、确定性 fixtures、同一会话断言）。
 *
 * R1：一笔 15,000.00 收款核销 应收A 8,000.00 + 应收B 7,000.00 → 同一会话逐页面断言
 *     收款单 +1 / 资金流水 +1 / 核销明细 +2 / 资金余额 +15,000.00 /
 *     应收余额 −15,000.00 / 加工收入变化 0.00（禁止刷新后孤立验证）。
 * R2：新建 10,000.00 应收单 → 应收余额 +10,000.00 / 对应期间收入 +10,000.00 /
 *     资金余额变化 0.00 / 资金流水数量变化 0。
 * R4：未来日期收款（2026-12-01）必须拒绝且全部余额/数量逐字段不变（UI 层 + Store/Domain
 *     最终防线双层验证）；补充：未来月应收单（2026-12）允许创建，但不计入截至
 *     2026-11-30 的已确认收入（裁决后语义，跨到 2026-12 的统计区间仍不得计入）。
 *
 * 基线 fixtures（createInitialPrototypeState，确定性）：
 *   收款单 8 / 资金流水 22 / 核销明细 10 / 应收单 24；
 *   资金余额 77,661.45 / 应收余额 402,567.87 / 期间加工收入（2026-11）99,278.32。
 */

/* ------------------------------- 会话与导航 ------------------------------- */

async function markSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>).__QA_D_SAME_SESSION__ = 'agent-d'
  })
}

async function expectSameSession(page: Page): Promise<void> {
  const marker = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__QA_D_SAME_SESSION__,
  )
  expect(marker).toBe('agent-d')
}

async function navTo(page: Page, label: string): Promise<void> {
  await page.getByRole('link', { name: label, exact: true }).click()
  await expectSameSession(page)
}

async function openRegistration(page: Page): Promise<void> {
  await page.getByTestId('open-registration').click()
  await expect(page.locator('#receipt-registration')).toBeVisible()
}

async function chooseCustomer(page: Page, customerName: string): Promise<void> {
  await page.getByTestId('registration-customer').click()
  await page.getByRole('option', { name: customerName }).click()
  await expect(page.getByTestId('registration-customer')).toContainText(customerName)
}

async function confirmReceiptViaDialog(page: Page): Promise<void> {
  await page.getByTestId('confirm-receipt').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确认收款' }).click()
  await expect(page.getByTestId('receipt-result')).toBeVisible()
}

/* ---------------------- Store 状态快照（真实应用内运行） ---------------------- */

interface StoreCounts {
  receipts: number
  transactions: number
  allocations: number
  receivables: number
}

/**
 * 经由真实浏览器内的应用实例读取 Pinia Mock Store 状态（单一数据源），
 * 用于收款单/流水/核销明细/应收单集合的精确数量断言（非 UI 文本近似）。
 */
async function storeCounts(page: Page): Promise<StoreCounts> {
  return page.evaluate(() => {
    const container = document.querySelector('#app') as unknown as {
      __vue_app__?: { config: { globalProperties: Record<string, unknown> } }
    }
    const app = container.__vue_app__
    if (app === undefined) {
      throw new Error('__vue_app__ 不可用：无法定位应用内 Store')
    }
    const pinia = app.config.globalProperties['$pinia'] as { _s: Map<string, unknown> }
    const store = pinia._s.get('prototype') as unknown as {
      receipts: unknown[]
      fundTransactions: unknown[]
      receiptAllocations: unknown[]
      receivables: unknown[]
    }
    return {
      receipts: store.receipts.length,
      transactions: store.fundTransactions.length,
      allocations: store.receiptAllocations.length,
      receivables: store.receivables.length,
    }
  })
}

/* ============================ R1 强制跨页面场景 ============================ */

test.describe('R1 15,000.00 收款核销 8,000+7,000（同一会话逐页面一致）', () => {
  test('收款单+1 / 流水+1 / 核销明细+2 / 资金+15,000 / 应收−15,000 / 加工收入±0.00', async ({
    page,
  }) => {
    await page.goto('/workbench')
    await markSession(page)

    // ---- 基线（看板 3 指标 + Store 4 集合计数）----
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('402,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    expect(await storeCounts(page)).toEqual({
      receipts: 8,
      transactions: 22,
      allocations: 10,
      receivables: 24,
    })

    // ---- 登记 15,000.00，核销 ar-001=8,000.00 / ar-002=7,000.00 ----
    await navTo(page, '加工费回款')
    await expect(page.getByTestId('receipt-list-table').getByText('共 8 条')).toBeVisible()
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await expect(page.getByTestId('allocation-row-ar-001')).toContainText('8,000.00')
    await expect(page.getByTestId('allocation-row-ar-002')).toContainText('12,000.00')
    await page.locator('#actual-amount').fill('15000')
    await page.locator('#allocation-input-ar-001').fill('8000')
    await page.locator('#allocation-input-ar-002').fill('7000')
    await expect(page.getByTestId('summary-actual')).toHaveText('15,000.00')
    await expect(page.getByTestId('summary-allocated')).toHaveText('15,000.00')
    await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')
    await confirmReceiptViaDialog(page)
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')
    await expect(page.getByTestId('result-transaction-no')).toContainText('FT-2026-0023')
    await expect(page.getByTestId('result-allocation-count')).toHaveText('2 笔')

    // ---- 断言 1：收款单 +1（SK-2026-0009 / 15,000.00 / 已核销 15,000.00 / 未分配 0.00）----
    const receiptTable = page.getByTestId('receipt-list-table')
    await expect(receiptTable.getByText('共 9 条')).toBeVisible()
    const receiptRow = receiptTable.locator('tbody tr', { hasText: 'SK-2026-0009' })
    await expect(receiptRow).toHaveCount(1)
    await expect(receiptRow.locator('td').nth(4)).toHaveText('15,000.00')
    await expect(receiptRow.locator('td').nth(5)).toHaveText('15,000.00')
    await expect(receiptRow.locator('td').nth(6)).toHaveText('0.00')
    await expect(receiptRow).toContainText('已全额核销')

    // ---- 断言 2：应收余额 −15,000.00（A 已结清 8,000/8,000/0.00；B 部分回款 7,000/5,000）----
    await navTo(page, '应收账款')
    const receivableTable = page.getByTestId('receivables-table')
    await expect(receivableTable.getByText('共 24 条')).toBeVisible()
    const rowA = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0001' })
    await expect(rowA).toContainText('已结清')
    await expect(rowA.locator('td').nth(5)).toHaveText('8,000.00')
    await expect(rowA.locator('td').nth(6)).toHaveText('8,000.00')
    await expect(rowA.locator('td').nth(7)).toHaveText('0.00')
    const rowB = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB).toContainText('部分回款')
    await expect(rowB.locator('td').nth(5)).toHaveText('12,000.00')
    await expect(rowB.locator('td').nth(6)).toHaveText('7,000.00')
    await expect(rowB.locator('td').nth(7)).toHaveText('5,000.00')

    // ---- 断言 3：核销明细 +2（A 详情 1 行 8,000.00 / B 详情 1 行 7,000.00）----
    await rowA.getByTestId('row-detail').click()
    await expect(page.getByTestId('receivable-detail-page')).toBeVisible()
    await expectSameSession(page)
    const allocA = page.getByTestId('allocation-details')
    await expect(allocA.locator('tbody tr')).toHaveCount(1)
    await expect(allocA.locator('tbody tr').first()).toContainText('8,000.00')
    await expect(allocA.locator('tbody tr').first()).toContainText('SK-2026-0009')
    await page.getByTestId('back-to-list').click()
    await expect(page.getByTestId('receivables-page')).toBeVisible()
    await rowB.getByTestId('row-detail').click()
    const allocB = page.getByTestId('allocation-details')
    await expect(allocB.locator('tbody tr')).toHaveCount(1)
    await expect(allocB.locator('tbody tr').first()).toContainText('7,000.00')
    await expect(allocB.locator('tbody tr').first()).toContainText('SK-2026-0009')

    // ---- 断言 4：资金流水 +1（FT-2026-0023 / IN 15,000.00 / 一笔收款只记一次流入）----
    await navTo(page, '资金流水')
    const txnTable = page.getByTestId('transactions-table')
    await expect(txnTable.getByText('共 23 条')).toBeVisible()
    const txnRow = txnTable.locator('tbody tr', { hasText: 'FT-2026-0023' })
    await expect(txnRow).toHaveCount(1)
    await expect(txnRow.locator('td').nth(5)).toHaveText('15,000.00') // 流入金额列
    await expect(txnRow.locator('td').nth(6)).toHaveText('—') // 流出金额列
    await expect(txnRow).toContainText('收款单 SK-2026-0009')

    // ---- 断言 5：Store 集合计数（收款单 8→9 / 流水 22→23 / 核销明细 10→12）----
    expect(await storeCounts(page)).toEqual({
      receipts: 9,
      transactions: 23,
      allocations: 12,
      receivables: 24,
    })

    // ---- 断言 6：资金余额 +15,000.00 / 应收余额 −15,000.00 / 加工收入变化 0.00 ----
    await navTo(page, '经营概览')
    await expect(page.getByTestId('metric-fund-balance')).toContainText('92,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('387,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    await expectSameSession(page)
  })
})

/* ============================ R2 创建应收单 ============================ */

test.describe('R2 新建 10,000.00 应收单（收入/余额/流水数量）', () => {
  test('应收余额+10,000 / 期间加工收入+10,000 / 资金余额±0.00 / 资金流水数量±0', async ({ page }) => {
    await page.goto('/workbench')
    await markSession(page)
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('402,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    expect(await storeCounts(page)).toEqual({
      receipts: 8,
      transactions: 22,
      allocations: 10,
      receivables: 24,
    })

    await navTo(page, '应收账款')
    await expect(page.getByTestId('receivables-table').getByText('共 24 条')).toBeVisible()
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

    // 列表 +1（AR-2026-0025 / 10,000.00 / 未收 10,000.00）
    const receivableTable = page.getByTestId('receivables-table')
    await expect(receivableTable.getByText('共 25 条')).toBeVisible()
    const newRow = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0025' })
    await expect(newRow).toHaveCount(1)
    await expect(newRow.locator('td').nth(5)).toHaveText('10,000.00')
    await expect(newRow.locator('td').nth(7)).toHaveText('10,000.00')

    // 看板：应收余额 +10,000、加工收入 +10,000、资金余额 0 变化
    await navTo(page, '经营概览')
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('412,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('109,278.32')

    // 资金流水数量变化 0 / 收款单数量变化 0（Store 计数互证）
    await navTo(page, '资金流水')
    await expect(page.getByTestId('transactions-table').getByText('共 22 条')).toBeVisible()
    expect(await storeCounts(page)).toEqual({
      receipts: 8,
      transactions: 22,
      allocations: 10,
      receivables: 25,
    })
    await expectSameSession(page)
  })
})

/* ==================== R4 未来日期收款拒绝 + 未来月收入不确认 ==================== */

test.describe('R4 未来日期边界', () => {
  test('未来日期收款（2026-12-01）被拒且全部余额/数量逐字段不变（UI + Store 双层）', async ({
    page,
  }) => {
    await page.goto('/workbench')
    await markSession(page)

    // ---- 失败前逐字段快照（看板 5 指标 + Store 4 集合 + 应收行金额）----
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('402,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    await expect(page.getByTestId('metric-receipts')).toContainText('37,246.01')
    await expect(page.getByTestId('metric-expenses')).toContainText('43,150.50')
    const before = await storeCounts(page)
    expect(before).toEqual({ receipts: 8, transactions: 22, allocations: 10, receivables: 24 })

    // ---- ① UI 层：填入未来日期 → 校验错误 + 禁止确认 ----
    await navTo(page, '加工费回款')
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('15000')
    await page.locator('#allocation-input-ar-001').fill('8000')
    await page.locator('#allocation-input-ar-002').fill('7000')
    await page.locator('#receipt-date').fill('2026-12-01')
    await page.locator('#receipt-date').blur()
    await expect(page.locator('#receipt-date-input-error')).toContainText('日期不得晚于 2026-11-30')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    // ---- ② Store/Domain 最终防线：绕过 UI 直接以未来日期确认 → 必须拒绝 ----
    const rejection = await page.evaluate(async () => {
      const container = document.querySelector('#app') as unknown as {
        __vue_app__?: { config: { globalProperties: Record<string, unknown> } }
      }
      const app = container.__vue_app__
      if (app === undefined) {
        throw new Error('__vue_app__ 不可用')
      }
      const pinia = app.config.globalProperties['$pinia'] as { _s: Map<string, unknown> }
      const store = pinia._s.get('prototype') as unknown as {
        confirmReceipt: (command: Record<string, unknown>) => Promise<unknown>
      }
      try {
        await store.confirmReceipt({
          idempotencyKey: 'qa-r4-future-date',
          customerId: 'cust-a',
          receiptDate: '2026-12-01',
          accountId: 'acct-bank',
          actualAmount: '15000.00',
          externalRef: null,
          remark: null,
          allocations: [
            { receivableId: 'ar-001', allocationAmount: '8000.00' },
            { receivableId: 'ar-002', allocationAmount: '7000.00' },
          ],
        })
        return { rejected: false, message: '' }
      } catch (error) {
        const err = error as { message?: string; errors?: Array<{ message: string }> }
        const messages = (err.errors ?? []).map((item) => item.message).join('；')
        return { rejected: true, message: messages || String(err.message ?? error) }
      }
    })
    expect(rejection.rejected, `未来日期收款必须拒绝，实际：${rejection.message}`).toBe(true)
    expect(rejection.message).toContain('不得晚于演示基准日 2026-11-30')

    // ---- 失败后逐字段快照：全部不变 ----
    expect(await storeCounts(page)).toEqual(before)
    await navTo(page, '应收账款')
    const receivableTable = page.getByTestId('receivables-table')
    await expect(receivableTable.getByText('共 24 条')).toBeVisible()
    const rowA = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0001' })
    await expect(rowA.locator('td').nth(6)).toHaveText('0.00')
    await expect(rowA.locator('td').nth(7)).toHaveText('8,000.00')
    const rowB = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB.locator('td').nth(6)).toHaveText('0.00')
    await expect(rowB.locator('td').nth(7)).toHaveText('12,000.00')
    await navTo(page, '加工费回款')
    await expect(page.getByTestId('receipt-list-table').getByText('共 8 条')).toBeVisible()
    await navTo(page, '经营概览')
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')
    await expect(page.getByTestId('metric-receivables-link')).toContainText('402,567.87')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    await expect(page.getByTestId('metric-receipts')).toContainText('37,246.01')
    await expect(page.getByTestId('metric-expenses')).toContainText('43,150.50')
    await expectSameSession(page)
  })

  test('未来月应收单（2026-12）允许创建，但不计入截至 2026-11-30 的已确认收入', async ({
    page,
  }) => {
    await page.goto('/workbench')
    await markSession(page)

    // 创建未来月应收单（会计期间 2026-12、对账日期 2026-12-05、5,000.00）→ 允许
    await navTo(page, '应收账款')
    await page.getByTestId('create-receivable-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('[aria-label="客户"]').click()
    await page.getByRole('option', { name: '示例客户 A' }).click()
    await dialog.getByLabel('所属月份').fill('2026-12')
    await dialog.getByLabel('对账日期').fill('2026-12-05')
    await dialog.getByLabel('到期日期').fill('2026-12-31')
    await dialog.locator('#create-amount').fill('5000')
    await page.getByTestId('create-receivable-submit').click()
    await expect(dialog).toBeHidden()

    const receivableTable = page.getByTestId('receivables-table')
    await expect(receivableTable.getByText('共 25 条')).toBeVisible()
    const newRow = receivableTable.locator('tbody tr', { hasText: 'AR-2026-0025' })
    await expect(newRow).toHaveCount(1)
    await expect(newRow).toContainText('2026-12')
    await expect(newRow.locator('td').nth(5)).toHaveText('5,000.00')

    // 默认期间（2026-11）：加工收入不变（未来月本就不在期间内）
    await navTo(page, '经营概览')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')

    // 关键判别：统计区间扩展到 2026-12-31 后，已确认收入仍不得包含未来月单据
    // （若误计应为 104,278.32 = 99,278.32 + 5,000.00）
    await page.getByTestId('date-preset-custom').click()
    await page.getByTestId('date-custom-from').fill('2026-11-01')
    await page.getByTestId('date-custom-to').fill('2026-12-31')
    await expect(page.getByTestId('date-range-value')).toContainText('2026-11-01 ~ 2026-12-31')
    await expect(page.getByTestId('metric-income')).toContainText('99,278.32')
    await expect(page.getByTestId('metric-income')).not.toContainText('104,278.32')

    // 应收余额含全部未收（402,567.87 + 5,000.00 = 407,567.87）；资金余额不变
    await expect(page.getByTestId('metric-receivables-link')).toContainText('407,567.87')
    await expect(page.getByTestId('metric-fund-balance')).toContainText('77,661.45')

    // 资金流水/收款单数量不变（未来月应收单不产生资金事实）
    await navTo(page, '资金流水')
    await expect(page.getByTestId('transactions-table').getByText('共 22 条')).toBeVisible()
    await navTo(page, '加工费回款')
    await expect(page.getByTestId('receipt-list-table').getByText('共 8 条')).toBeVisible()
    await expectSameSession(page)
  })
})
