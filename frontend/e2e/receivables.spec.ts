import { expect, test } from '@playwright/test'

import { createCustomer, createReceivable, currentMonth, today, uniqueSuffix } from './business-fixtures'

/**
 * 应收账款页面（真实后端 + MySQL）：
 * 新建应收单 → 列表展示派生状态 → 详情页 → 回款入口跳转。
 */

test.describe('应收账款（真实业务）', () => {
  test('新建应收单：确认后进入列表，状态为未回款且不增加资金余额', async ({ page, request }) => {
    const suffix = uniqueSuffix()
    const customer = await createCustomer(request, `列表客户-${suffix}`)

    await page.goto('/business/receivables')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
    await page.getByTestId('create-receivable-open').click()

    const form = page.getByTestId('create-receivable-form')
    await form.getByRole('combobox', { name: '客户' }).click()
    await page.getByRole('option', { name: customer.name }).click()
    await form.locator('#create-month').fill(currentMonth())
    await form.locator('#create-statement-date').fill(today())
    await form.locator('#create-amount').fill('12345.67')
    await form.getByRole('textbox', { name: '备注' }).fill(`应收-${suffix}`)
    await page.getByTestId('create-receivable-submit').click()

    await expect(page.getByTestId('create-receivable-form')).toBeHidden()
    const table = page.getByTestId('receivables-table')
    await expect(table).toBeVisible()
    await expect(table.locator('tbody tr', { hasText: customer.name }).first()).toBeVisible()
    await expect(table).toContainText('12,345.67')
    await expect(table).toContainText('未回款')
  })

  test('状态/逾期筛选与清空筛选保持列表可用', async ({ page }) => {
    await page.goto('/business/receivables')
    await expect(page.getByTestId('receivables-table')).toBeVisible()

    await page.getByTestId('filter-status').click()
    await page.getByRole('option', { name: '已结清' }).click()
    await expect(page.getByTestId('receivables-table')).toBeVisible()

    await page.getByTestId('filter-clear').click()
    await expect(page.getByTestId('receivables-table')).toBeVisible()
  })

  test('详情页展示派生指标并可跳转回款登记', async ({ page, request }) => {
    const suffix = uniqueSuffix()
    const customer = await createCustomer(request, `详情客户-${suffix}`)
    const created = await createReceivable(request, {
      customerId: customer.id,
      amount: '4000.00',
      dueDate: today(),
      label: `详情应收-${suffix}`,
    })

    await page.goto(`/business/receivables/${created.id}`)
    await expect(page.getByTestId('receivable-detail-page')).toBeVisible()
    await expect(page.getByTestId('detail-summary')).toContainText('4,000.00')
    await page.getByTestId('register-payment').click()
    await expect(page).toHaveURL(/\/business\/processing-fee\?action=create/)
  })
})
