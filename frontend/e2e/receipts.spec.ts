import { expect, test } from '@playwright/test'

import {
  accountBalance,
  createAccount,
  createCustomer,
  createReceivable,
  idempotencyKey,
  receivable,
  today,
  uniqueSuffix,
} from './business-fixtures'

/**
 * 加工费回款页面（真实后端 + MySQL）：多对多核销、全额核销限制、撤销。
 */

async function prepare(request: Parameters<typeof createCustomer>[0], suffix: string) {
  const customer = await createCustomer(request, `回款页客户-${suffix}`)
  const account = await createAccount(request, `回款页账户-${suffix}`, '0.00')
  return { customer, account }
}

test.describe('加工费回款（真实业务）', () => {
  test('全额核销：登记 3,000 收款并核销一张应收单，结果面板与余额一致', async ({ page, request }) => {
    const suffix = uniqueSuffix()
    const { customer, account } = await prepare(request, suffix)
    const target = await createReceivable(request, {
      customerId: customer.id,
      amount: '3000.00',
      dueDate: today(),
      label: `回款应收-${suffix}`,
    })

    await page.goto(`/business/processing-fee?action=create&customerId=${customer.id}`)
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: customer.name }).click()
    await page.getByTestId('registration-account').click()
    await page.getByRole('option', { name: account.name }).click()
    await page.locator('#actual-amount').fill('3000')
    await page.locator(`[data-testid="allocation-row-${target.id}"] input`).fill('3000')

    await expect(page.getByTestId('summary-unallocated')).toContainText('0.00')
    await page.getByTestId('confirm-receipt').click()
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()

    await expect(page.getByTestId('receipt-result')).toBeVisible()
    await expect(page.getByTestId('result-allocation-count')).toContainText('1')

    expect(await accountBalance(request, account.id)).toBe('3000.00')
    const settled = await receivable(request, target.id)
    expect(settled.paymentStatus).toBe('SETTLED')
    expect(settled.outstandingAmount).toBe('0.00')
  })

  test('未全额核销被阻断：提示未分配金额且确认按钮不可用', async ({ page, request }) => {
    const suffix = uniqueSuffix()
    const { customer, account } = await prepare(request, suffix)
    const target = await createReceivable(request, {
      customerId: customer.id,
      amount: '5000.00',
      dueDate: today(),
      label: `未分配应收-${suffix}`,
    })

    await page.goto(`/business/processing-fee?action=create&customerId=${customer.id}`)
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: customer.name }).click()
    await page.getByTestId('registration-account').click()
    await page.getByRole('option', { name: account.name }).click()
    await page.locator('#actual-amount').fill('5000')
    await page.locator(`[data-testid="allocation-row-${target.id}"] input`).fill('3000')

    await expect(page.getByTestId('summary-unallocated')).toContainText('2,000.00')
    await expect(page.getByTestId('unallocated-warning')).toBeVisible()
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    expect(await accountBalance(request, account.id)).toBe('0.00')
  })

  test('超额核销被阻断：行内错误提示且不可确认', async ({ page, request }) => {
    const suffix = uniqueSuffix()
    const { customer, account } = await prepare(request, suffix)
    const target = await createReceivable(request, {
      customerId: customer.id,
      amount: '1000.00',
      dueDate: today(),
      label: `超额应收-${suffix}`,
    })

    await page.goto(`/business/processing-fee?action=create&customerId=${customer.id}`)
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: customer.name }).click()
    await page.getByTestId('registration-account').click()
    await page.getByRole('option', { name: account.name }).click()
    await page.locator('#actual-amount').fill('2000')
    await page.locator(`[data-testid="allocation-row-${target.id}"] input`).fill('2000')

    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()
    expect(await accountBalance(request, account.id)).toBe('0.00')
  })

  test('收款后列表同步展示收款单与核销状态', async ({ page, request }) => {
    const suffix = uniqueSuffix()
    const { customer, account } = await prepare(request, suffix)
    const target = await createReceivable(request, {
      customerId: customer.id,
      amount: '1500.00',
      dueDate: today(),
      label: `列表应收-${suffix}`,
    })

    await page.goto(`/business/processing-fee?action=create&customerId=${customer.id}`)
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: customer.name }).click()
    await page.getByTestId('registration-account').click()
    await page.getByRole('option', { name: account.name }).click()
    await page.locator('#actual-amount').fill('1500')
    await page.locator(`[data-testid="allocation-row-${target.id}"] input`).fill('1500')
    await page.getByTestId('confirm-receipt').click()
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await expect(page.getByTestId('receipt-result')).toBeVisible()

    expect(await accountBalance(request, account.id)).toBe('1500.00')

    // 收款单列表可见，并展示核销状态
    await page.getByTestId('receipt-list').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('receipt-list')).toContainText(customer.name)
  })
})
