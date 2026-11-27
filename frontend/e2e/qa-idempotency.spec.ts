import { expect, test, type Page } from '@playwright/test'

/**
 * Phase 0.3 Agent D 独立 QA 强制回归 R3 —— 幂等语义（真实浏览器、确定性 fixtures）。
 *
 * R3-a：重复确认仅一笔（确认按钮双击 → 仅一张收款单 / 一条资金流入 / 核销不重复）。
 * R3-b：**同一幂等键、不同参数必须 CONFLICT 拒绝** —— 含 A1 整改的分隔符序列化冲突场景：
 *       externalRef='BANK#A' + remark='B' vs externalRef='BANK' + remark='A#B'
 *       （旧 join('#') 序列化下两组参数串完全相同 → 会被误判"同参"静默返回原单；
 *         整改后长度前缀序列化必须区分 → CONFLICT 拒绝且零状态变化）。
 *       通过 addInitScript 固定 Date.now/Math.random 使两表单会话生成**同一幂等键**。
 * R3-c：**不同幂等键**时两组参数各自产生独立收款单（2 张收款单 / 2 条流水）。
 *
 * 基线 fixtures：收款单 8 / 资金流水 22 / 核销明细 10 / 应收单 24；
 * ar-001 原始 8,000.00（未收 8,000.00）、ar-002 原始 12,000.00（未收 12,000.00）。
 */

/* ------------------------------- 会话与导航 ------------------------------- */

async function markSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>).__QA_D_SAME_SESSION__ = 'agent-d-r3'
  })
}

async function expectSameSession(page: Page): Promise<void> {
  const marker = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__QA_D_SAME_SESSION__,
  )
  expect(marker).toBe('agent-d-r3')
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

/** 填写一笔「1,000.00 → ar-002」的收款登记（含外部参考号与备注） */
async function fillReceipt(
  page: Page,
  externalRef: string,
  remark: string,
): Promise<void> {
  await chooseCustomer(page, '示例客户 A')
  await page.locator('#actual-amount').fill('1000')
  await page.locator('#allocation-input-ar-002').fill('1000')
  await page.getByTestId('registration-external-ref').fill(externalRef)
  await page.getByTestId('registration-remark').fill(remark)
  await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')
}

async function openConfirmDialog(page: Page): Promise<void> {
  await page.getByTestId('confirm-receipt').click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/* ==================== R3-a 重复确认仅一笔（同键同参） ==================== */

test.describe('R3-a 重复确认仅一笔', () => {
  test('确认按钮双击仅一张收款单/一条流水，核销金额不重复扣减', async ({ page }) => {
    await page.goto('/business/processing-fee')
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
    await dialog.getByRole('button', { name: '确认收款' }).dblclick()
    await expect(page.getByTestId('receipt-result')).toBeVisible()

    // 仅一张收款单 SK-2026-0009 / 两条核销
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')
    await expect(page.getByTestId('result-allocation-count')).toHaveText('2 笔')
    const receiptTable = page.getByTestId('receipt-list-table')
    await expect(receiptTable.getByText('共 9 条')).toBeVisible()
    await expect(receiptTable.locator('tbody tr', { hasText: 'SK-2026-0009' })).toHaveCount(1)

    // 仅一条资金流入（FT-2026-0023 唯一命中）
    await page.getByRole('link', { name: '资金流水', exact: true }).click()
    await expectSameSession(page)
    await expect(page.getByTestId('transactions-table').getByText('共 23 条')).toBeVisible()
    await page.getByPlaceholder('搜索流水编号、交易对手或备注…').fill('FT-2026-0023')
    await expect(page.getByTestId('transactions-table').locator('tbody tr')).toHaveCount(1)

    // 核销不重复：ar-001 已收 8,000.00 未收 0.00；ar-002 已收 7,000.00 未收 5,000.00
    await page.getByRole('link', { name: '应收账款', exact: true }).click()
    await expectSameSession(page)
    const table = page.getByTestId('receivables-table')
    const rowA = table.locator('tbody tr', { hasText: 'AR-2026-0001' })
    await expect(rowA.locator('td').nth(6)).toHaveText('8,000.00')
    await expect(rowA.locator('td').nth(7)).toHaveText('0.00')
    const rowB = table.locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB.locator('td').nth(6)).toHaveText('7,000.00')
    await expect(rowB.locator('td').nth(7)).toHaveText('5,000.00')
    await expectSameSession(page)
  })
})

/* ============ R3-b 同一幂等键、不同参数 → CONFLICT（分隔符冲突场景） ============ */

test.describe('R3-b 同键异参必须 CONFLICT（A1 分隔符序列化冲突场景）', () => {
  test('BANK#A|B 与 BANK|A#B 同键二次确认必须拒绝且零状态变化', async ({ page }) => {
    // 确定性 fixtures：固定 Date.now + Math.random → 两个表单会话生成**同一幂等键**
    // （sk-form-<固定时间戳>-<固定随机后缀>），复现"同一幂等键、不同参数"场景。
    await page.addInitScript(() => {
      const holder = window as unknown as { __QA_D_RAND_SEED__?: string }
      holder.__QA_D_RAND_SEED__ = '0.25'
      Math.random = () =>
        Number((window as unknown as { __QA_D_RAND_SEED__?: string }).__QA_D_RAND_SEED__ ?? '0.25')
      Date.now = () => 1764480000000
    })

    await page.goto('/business/processing-fee')
    await markSession(page)

    // ---- 会话 1：externalRef='BANK#A' + remark='B' → 正常确认（SK-2026-0009）----
    await openRegistration(page)
    await fillReceipt(page, 'BANK#A', 'B')
    await openConfirmDialog(page)
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await expect(page.getByTestId('receipt-result')).toBeVisible()
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')

    // ---- 会话 2（同一幂等键）：externalRef='BANK' + remark='A#B' → 必须 CONFLICT ----
    await page.getByTestId('continue-registration').click()
    await expect(page.locator('#receipt-registration')).toBeVisible()
    await fillReceipt(page, 'BANK', 'A#B')
    await openConfirmDialog(page)
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()

    // CONFLICT 拒绝：错误提示可见、无成功结果（旧 join('#') 序列化会把两组参数误判同参）
    await expect(page.getByTestId('submit-errors')).toContainText('业务参数不一致')
    await expect(page.getByTestId('receipt-result')).toBeHidden()

    // 零状态变化：收款单 8+1=9、流水 22+1=23、ar-002 已收仍 1,000.00（不重复核销）
    const receiptTable = page.getByTestId('receipt-list-table')
    await expect(receiptTable.getByText('共 9 条')).toBeVisible()
    await expect(receiptTable.locator('tbody tr', { hasText: 'SK-2026-0009' })).toHaveCount(1)

    // 冲突参数未落库：搜 'BANK#A' 命中会话 1 的 1 张；搜 'A#B' 命中 0 张
    const receiptSearch = page.getByPlaceholder('搜索单据编号 / 参考号 / 备注…')
    await receiptSearch.fill('BANK#A')
    await expect(receiptTable.getByText('共 1 条')).toBeVisible()
    await receiptSearch.fill('A#B')
    await expect(receiptTable.getByText('共 0 条')).toBeVisible()
    await receiptSearch.fill('')

    await page.getByRole('link', { name: '资金流水', exact: true }).click()
    await expectSameSession(page)
    await expect(page.getByTestId('transactions-table').getByText('共 23 条')).toBeVisible()

    await page.getByRole('link', { name: '应收账款', exact: true }).click()
    await expectSameSession(page)
    const rowB = page.getByTestId('receivables-table').locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB.locator('td').nth(6)).toHaveText('1,000.00')
    await expect(rowB.locator('td').nth(7)).toHaveText('11,000.00')
    await expectSameSession(page)
  })
})

/* ============ R3-c 不同幂等键：两组参数各自产生独立收款单 ============ */

test.describe('R3-c 不同幂等键各产生独立收款单', () => {
  test('BANK#A|B 与 BANK|A#B 在不同键下分别生成 SK-2026-0009 / SK-2026-0010', async ({ page }) => {
    await page.goto('/business/processing-fee')
    await markSession(page)

    // 第一笔（键 1）：externalRef='BANK#A' + remark='B'
    await openRegistration(page)
    await fillReceipt(page, 'BANK#A', 'B')
    await openConfirmDialog(page)
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await expect(page.getByTestId('receipt-result')).toBeVisible()
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')

    // 第二笔（键 2，表单重置后新键）：externalRef='BANK' + remark='A#B'
    await page.getByTestId('continue-registration').click()
    await expect(page.locator('#receipt-registration')).toBeVisible()
    await fillReceipt(page, 'BANK', 'A#B')
    await openConfirmDialog(page)
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await expect(page.getByTestId('receipt-result')).toBeVisible()
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0010')

    // 两张独立收款单、两条独立流水
    const receiptTable = page.getByTestId('receipt-list-table')
    await expect(receiptTable.getByText('共 10 条')).toBeVisible()
    const receiptSearch = page.getByPlaceholder('搜索单据编号 / 参考号 / 备注…')
    await receiptSearch.fill('BANK#A')
    await expect(receiptTable.getByText('共 1 条')).toBeVisible()
    await receiptSearch.fill('A#B')
    await expect(receiptTable.getByText('共 1 条')).toBeVisible()
    await receiptSearch.fill('')

    await page.getByRole('link', { name: '资金流水', exact: true }).click()
    await expectSameSession(page)
    await expect(page.getByTestId('transactions-table').getByText('共 24 条')).toBeVisible()

    // ar-002 累计已收 2,000.00、未收 10,000.00（两笔核销独立入账）
    await page.getByRole('link', { name: '应收账款', exact: true }).click()
    await expectSameSession(page)
    const rowB = page.getByTestId('receivables-table').locator('tbody tr', { hasText: 'AR-2026-0002' })
    await expect(rowB.locator('td').nth(6)).toHaveText('2,000.00')
    await expect(rowB.locator('td').nth(7)).toHaveText('10,000.00')
    await expectSameSession(page)
  })
})
