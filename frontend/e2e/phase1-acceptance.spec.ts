/**
 * Phase 1 E2E —— 全 UI 验收流程（真实 API）：
 * 登录 → 账户 → 出资 → 支出 → 转账 → 流水 → 概览 → 撤销。
 *
 * 数字断言采用「增量法」（BigInt 分精确比较）：共享后端存在历史数据时仍可精确断言
 * 本次操作的财务影响；金额展示断言为千分位格式化文本。
 * 供集成阶段全栈运行（前置条件见 phase1-helpers.ts）。
 */

import { expect, test } from '@playwright/test'

import {
  actionInRow,
  businessToday,
  centsToMoney,
  fillFormField,
  login,
  moneyToCents,
  runId,
  selectOption,
  submitDialog,
} from './phase1-helpers'

async function readMoney(page: import('@playwright/test').Page, testId: string): Promise<bigint> {
  const text = await page.getByTestId(testId).locator('.amount').first().innerText()
  return moneyToCents(text)
}

test.describe('Phase 1 全 UI 验收流程（真实 API）', () => {
  test('登录→账户→出资→支出→转账→流水→概览→撤销', async ({ page }) => {
    const id = runId()
    const shareholderName = `E2E股东-${id}`
    const cashAccount = `E2E现金-${id}`
    const bankAccount = `E2E银行-${id}`
    const remarkPrefix = `E2E-${id}`
    const today = await businessToday(page)

    await login(page)

    /* ------------------------------ 基础资料：股东 ------------------------------ */
    await test.step('新增股东', async () => {
      await page.goto('/masterdata/shareholders')
      await page.getByTestId('create-shareholder').click()
      await fillFormField(page, 'name', shareholderName)
      await submitDialog(page, '新增股东')
      await expect(page.getByTestId('shareholders-table')).toContainText(shareholderName)
    })

    /* -------------------------------- 资金账户 -------------------------------- */
    await test.step('新增资金账户（期初余额 10,000.00 / 0.00）', async () => {
      await page.goto('/treasury/accounts')
      await page.getByTestId('create-account').click()
      await fillFormField(page, 'accountName', cashAccount)
      await selectOption(page, '账户类型', '现金')
      await fillFormField(page, 'openingBalance', '10000.00')
      await submitDialog(page, '新增资金账户')
      await expect(page.getByTestId('accounts-table')).toContainText(cashAccount)
      await expect(page.getByTestId('accounts-table')).toContainText('10,000.00')

      await page.getByTestId('create-account').click()
      await fillFormField(page, 'accountName', bankAccount)
      await selectOption(page, '账户类型', '银行')
      await fillFormField(page, 'openingBalance', '0.00')
      await submitDialog(page, '新增资金账户')
      await expect(page.getByTestId('accounts-table')).toContainText(bankAccount)
    })

    /* -------------------------- 概览基线（增量法断言用） ------------------------- */
    await page.goto('/workbench')
    const baseBalance = await readMoney(page, 'metric-fundBalance')
    const baseContribution = await readMoney(page, 'metric-periodContribution')
    const baseExpenses = await readMoney(page, 'metric-periodExpenses')

    /* -------------------------------- 业务录入 -------------------------------- */
    await test.step('新增股东出资 2,500.50（同事务生成流入流水）', async () => {
      await page.goto('/treasury/contributions')
      await page.getByTestId('create-contribution').click()
      await selectOption(page, '股东', shareholderName)
      await selectOption(page, '入账账户', cashAccount)
      await fillFormField(page, 'amount', '2,500.50')
      await fillFormField(page, 'bizDate', today)
      await fillFormField(page, 'remark', `${remarkPrefix}-CZ`)
      await submitDialog(page, '确认出资')
      await expect(page.getByTestId('contributions-table')).toContainText('2,500.50')
      await expect(page.getByTestId('contributions-table')).toContainText('已确认')
    })

    await test.step('新增支出 320.25（同事务生成流出流水）', async () => {
      await page.goto('/treasury/expenses')
      await page.getByTestId('create-expense').click()
      await selectOption(page, '支出分类', '其他')
      await selectOption(page, '付款账户', cashAccount)
      await fillFormField(page, 'amount', '320.25')
      await fillFormField(page, 'bizDate', today)
      await fillFormField(page, 'counterparty', 'E2E供应商')
      await fillFormField(page, 'remark', `${remarkPrefix}-ZY`)
      await submitDialog(page, '确认支出')
      await expect(page.getByTestId('expenses-table')).toContainText('320.25')
    })

    await test.step('新增转账 700.00（同事务生成成对流水，不产生收支）', async () => {
      await page.goto('/treasury/transfers')
      await page.getByTestId('create-transfer').click()
      await selectOption(page, '转出账户', cashAccount)
      await selectOption(page, '转入账户', bankAccount)
      await fillFormField(page, 'amount', '700.00')
      await fillFormField(page, 'bizDate', today)
      await fillFormField(page, 'remark', `${remarkPrefix}-ZZ`)
      await submitDialog(page, '确认转账')
      await expect(page.getByTestId('transfers-table')).toContainText('700.00')
    })

    /* -------------------------------- 资金流水 -------------------------------- */
    await test.step('资金流水：搜索/筛选/详情（来源单据与撤销信息）', async () => {
      await page.goto('/treasury/transactions')
      await page.getByTestId('filter-keyword').locator('input').fill(remarkPrefix)
      // 本次三笔业务对应的流水（出资 IN / 支出 OUT / 转账 OUT+IN）
      await expect(page.getByTestId('transactions-table')).toContainText('2,500.50')
      await expect(page.getByTestId('transactions-table')).toContainText('320.25')
      await expect(page.getByTestId('transactions-table')).toContainText('700.00')

      // 详情：来源单据 + 撤销信息（撤销时间占位）
      await page.getByTestId('transaction-detail-button').first().click()
      await expect(page.locator('[role="dialog"]').last()).toContainText('来源单据')
      await expect(page.locator('[role="dialog"]').last()).toContainText('撤销时间')
    })

    /* -------------------------------- 经营概览 -------------------------------- */
    await test.step('经营概览：真实数字断言（增量法）', async () => {
      await page.goto('/workbench')
      // 资金余额 +2,500.50 − 320.25 = +2,180.25（转账整体净变化 0）
      const balance = await readMoney(page, 'metric-fundBalance')
      expect(centsToMoney(balance - baseBalance)).toBe('2,180.25')
      // 期间股东出资 +2,500.50；期间实际支出 +320.25
      const contribution = await readMoney(page, 'metric-periodContribution')
      const expenses = await readMoney(page, 'metric-periodExpenses')
      expect(centsToMoney(contribution - baseContribution)).toBe('2,500.50')
      expect(centsToMoney(expenses - baseExpenses)).toBe('320.25')

      // 近期流水包含本次出资（带符号金额）
      await expect(page.getByTestId('recent-transactions')).toContainText('+2,500.50')
    })

    /* -------------------------------- 撤销 -------------------------------- */
    await test.step('撤销出资单（保留原单据 + 反向流水，不可重复撤销）', async () => {
      await page.goto('/treasury/contributions')
      await page.getByTestId('filter-keyword').locator('input').fill(`${remarkPrefix}-CZ`)
      await actionInRow(page, `${remarkPrefix}-CZ`, 'row-void')
      await submitDialog(page, '确认撤销')
      await expect(page.getByTestId('contributions-table')).toContainText('已撤销')
    })

    await test.step('撤销后概览回退（−2,500.50）', async () => {
      await page.goto('/workbench')
      const balance = await readMoney(page, 'metric-fundBalance')
      // 基线 − 320.25（出资已撤销生成反向流水）
      expect(centsToMoney(balance - baseBalance)).toBe('-320.25')
    })
  })
})
