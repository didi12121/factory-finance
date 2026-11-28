import { expect, test } from '@playwright/test'

import {
  accountBalance,
  apiGet,
  apiPost,
  createAccount,
  createCustomer,
  createReceivable,
  createSupplier,
  currentMonth,
  idempotencyKey,
  payable,
  receivable,
  today,
  uniqueSuffix,
} from './business-fixtures'

/**
 * Phase 2 核心验收（真实浏览器 + 真实后端 + 真实数据库）：
 *
 * 场景一：两张应收单 8,000 / 12,000；收到 15,000 分别核销 8,000 + 7,000。
 * 场景二：应付 10,000，付款 4,000。
 * 红线：幂等、并发/超额/跨客户核销、撤销恢复、非法金额、事务零变化。
 */

test.describe('Phase 2 正式应收应付与核销验收', () => {
  test('场景一：一笔收款核销两张应收单（8,000 + 7,000）', async ({ page, request }) => {
    const suffix = uniqueSuffix()
    const customer = await createCustomer(request, `回款客户-${suffix}`)
    const account = await createAccount(request, `回款账户-${suffix}`, '0.00')
    const first = await createReceivable(request, {
      customerId: customer.id,
      amount: '8000.00',
      dueDate: today(),
      label: `应收A-${suffix}`,
    })
    const second = await createReceivable(request, {
      customerId: customer.id,
      amount: '12000.00',
      dueDate: today(),
      label: `应收B-${suffix}`,
    })

    // 应收单确认后不增加资金余额
    expect(await accountBalance(request, account.id)).toBe('0.00')

    await page.goto(`/business/processing-fee?action=create&customerId=${customer.id}`)
    await expect(page.getByTestId('registration-customer')).toBeVisible()
    await page.getByTestId('registration-customer').click()
    await page.getByRole('option', { name: customer.name }).click()
    await page.getByTestId('registration-account').click()
    await page.getByRole('option', { name: account.name }).click()

    await page.locator('#actual-amount').fill('15000')
    await page.locator(`[data-testid="allocation-row-${first.id}"] input`).fill('8000')
    await page.locator(`[data-testid="allocation-row-${second.id}"] input`).fill('7000')

    await expect(page.getByTestId('summary-unallocated')).toContainText('0.00')
    await page.getByTestId('confirm-receipt').click()
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()

    // 结果面板：一笔收款 + 2 条核销明细
    await expect(page.getByTestId('receipt-result')).toBeVisible()
    await expect(page.getByTestId('result-allocation-count')).toContainText('2')

    // 资金余额增加 15,000；应收余额剩余 5,000
    expect(await accountBalance(request, account.id)).toBe('15000.00')
    const settled = await receivable(request, first.id)
    expect(settled.outstandingAmount).toBe('0.00')
    expect(settled.paymentStatus).toBe('SETTLED')
    const partial = await receivable(request, second.id)
    expect(partial.outstandingAmount).toBe('5000.00')
    expect(partial.paymentStatus).toBe('PARTIALLY_PAID')

    // 营业收入不重复增加：应收合计不变（原始金额合计仍为 20,000）
    const summary = await apiGet<{ outstanding: string; confirmedTotal: string }>(
      request,
      '/receivable/summary',
    )
    expect(Number.parseFloat(summary.data.confirmedTotal)).toBeGreaterThanOrEqual(20000)

    // 页面上应收列表同步展示未收 5,000.00
    await page.goto('/business/receivables')
    await expect(page.getByTestId('receivables-table')).toBeVisible()
    await expect(page.locator(`text=${second.statementNo}`)).toBeVisible()
    await expect(page.locator(`text=${first.statementNo}`)).toBeVisible()
  })

  test('场景二：应付 10,000 支付 4,000（不重复扣减采购付款）', async ({ page, request }) => {
    const suffix = uniqueSuffix()
    const supplier = await createSupplier(request, `供应商-${suffix}`)
    const account = await createAccount(request, `付款账户-${suffix}`, '10000.00')
    const payableResult = await apiPost<{ id: string; payableNo: string }>(request, '/payable/payables', {
      supplierId: Number(supplier.id),
      bizDate: today(),
      accountingMonth: currentMonth(),
      dueDate: today(),
      amount: '10000.00',
      content: `采购-${suffix}`,
      idempotencyKey: idempotencyKey('ap'),
    })
    expect(payableResult.status).toBe(200)
    const payableId = payableResult.data.id
    const payableNo = payableResult.data.payableNo

    // 确认应付不立即扣减资金
    expect(await accountBalance(request, account.id)).toBe('10000.00')

    await page.goto('/business/payables')
    await expect(page.getByTestId('payables-table')).toBeVisible()
    const row = page.locator(`[data-testid="payables-table"] tbody tr`, { hasText: payableNo })
    await expect(row).toBeVisible()
    await row.getByTestId('row-pay').click()

    const paymentDialog = page.getByRole('dialog')
    await paymentDialog.getByRole('combobox', { name: '付款账户' }).click()
    await page.getByRole('option', { name: account.name }).click()
    await paymentDialog.locator(`[data-testid="alloc-row-${payableNo}"] input`).fill('4000')
    await paymentDialog.getByTestId('confirm-payment').click()

    await expect(page.getByRole('dialog')).toBeHidden()

    // 应付余额 6,000；资金余额减少 4,000
    const afterPay = await payable(request, payableId)
    expect(afterPay.paidAmount).toBe('4000.00')
    expect(afterPay.outstandingAmount).toBe('6000.00')
    expect(afterPay.paymentStatus).toBe('PARTIALLY_PAID')
    expect(await accountBalance(request, account.id)).toBe('6000.00')

    // 付款单只生成一次资金流出（不重复记录采购付款）
    const payments = await apiGet<{ items: { payableId?: string; amount: string; allocations: { payableId: string }[] }[] }>(
      request,
      '/payable/payments',
      { page: 1, size: 500 },
    )
    const related = payments.data.items.filter((item) =>
      item.allocations.some((allocation) => allocation.payableId === payableId),
    )
    expect(related).toHaveLength(1)
    expect(related[0]?.amount).toBe('4000.00')
  })

  test('幂等：同键重复提交只记一次资金流入', async ({ request }) => {
    const suffix = uniqueSuffix()
    const customer = await createCustomer(request, `幂等客户-${suffix}`)
    const account = await createAccount(request, `幂等账户-${suffix}`, '0.00')
    const target = await createReceivable(request, {
      customerId: customer.id,
      amount: '1000.00',
      dueDate: today(),
      label: `幂等应收-${suffix}`,
    })
    const body = {
      customerId: Number(customer.id),
      receiptDate: today(),
      accountId: Number(account.id),
      actualAmount: '1000.00',
      externalRef: null,
      remark: null,
      allocations: [{ receivableId: Number(target.id), amount: '1000.00' }],
      idempotencyKey: idempotencyKey('sk'),
    }

    const first = await apiPost<{ receiptNo: string }>(request, '/receivable/receipts', body)
    const second = await apiPost<{ receiptNo: string }>(request, '/receivable/receipts', body)
    expect(first.status, first.message).toBe(200)
    expect(second.status, second.message).toBe(200)
    expect(second.data.receiptNo).toBe(first.data.receiptNo)
    expect(await accountBalance(request, account.id)).toBe('1000.00')

    // 同键异参拒绝
    const conflict = await apiPost(request, '/receivable/receipts', { ...body, actualAmount: '999.00' })
    expect(conflict.status).toBe(409)
    expect(await accountBalance(request, account.id)).toBe('1000.00')

    // 不同幂等键的相同业务内容允许各自提交（业务内容不参与幂等判断）
    const another = await createReceivable(request, {
      customerId: customer.id,
      amount: '1000.00',
      dueDate: today(),
      label: `幂等应收二-${suffix}`,
    })
    const anotherTwin = await createReceivable(request, {
      customerId: customer.id,
      amount: '1000.00',
      dueDate: today(),
      label: `幂等应收二-${suffix}`,
    })
    const sameContentOne = await apiPost<{ receiptNo: string }>(request, '/receivable/receipts', {
      ...body,
      idempotencyKey: idempotencyKey('sk'),
      allocations: [{ receivableId: Number(another.id), amount: '1000.00' }],
    })
    const sameContentTwo = await apiPost<{ receiptNo: string }>(request, '/receivable/receipts', {
      ...body,
      idempotencyKey: idempotencyKey('sk'),
      allocations: [{ receivableId: Number(anotherTwin.id), amount: '1000.00' }],
    })
    expect(sameContentOne.status, sameContentOne.message).toBe(200)
    expect(sameContentTwo.status, sameContentTwo.message).toBe(200)
    expect(sameContentTwo.data.receiptNo).not.toBe(sameContentOne.data.receiptNo)
    expect(await accountBalance(request, account.id)).toBe('3000.00')
  })

  test('超额核销 / 跨客户核销 / 未全额核销被拒绝且零变化', async ({ request }) => {
    const suffix = uniqueSuffix()
    const customer = await createCustomer(request, `校验客户-${suffix}`)
    const otherCustomer = await createCustomer(request, `校验他客户-${suffix}`)
    const account = await createAccount(request, `校验账户-${suffix}`, '0.00')
    const target = await createReceivable(request, {
      customerId: customer.id,
      amount: '5000.00',
      dueDate: today(),
      label: `校验应收-${suffix}`,
    })
    const other = await createReceivable(request, {
      customerId: otherCustomer.id,
      amount: '3000.00',
      dueDate: today(),
      label: `他客户应收-${suffix}`,
    })

    const overAllocate = await apiPost(request, '/receivable/receipts', {
      customerId: Number(customer.id),
      receiptDate: today(),
      accountId: Number(account.id),
      actualAmount: '6000.00',
      allocations: [{ receivableId: Number(target.id), amount: '6000.00' }],
      idempotencyKey: idempotencyKey('sk'),
    })
    expect(overAllocate.status).toBe(400)

    const crossCustomer = await apiPost(request, '/receivable/receipts', {
      customerId: Number(customer.id),
      receiptDate: today(),
      accountId: Number(account.id),
      actualAmount: '3000.00',
      allocations: [{ receivableId: Number(other.id), amount: '3000.00' }],
      idempotencyKey: idempotencyKey('sk'),
    })
    expect(crossCustomer.status).toBe(400)

    const partiallyAllocated = await apiPost(request, '/receivable/receipts', {
      customerId: Number(customer.id),
      receiptDate: today(),
      accountId: Number(account.id),
      actualAmount: '5000.00',
      allocations: [{ receivableId: Number(target.id), amount: '3000.00' }],
      idempotencyKey: idempotencyKey('sk'),
    })
    expect(partiallyAllocated.status).toBe(400)

    // 事务失败零变化：资金余额与应收余额均未变
    expect(await accountBalance(request, account.id)).toBe('0.00')
    const untouched = await receivable(request, target.id)
    expect(untouched.outstandingAmount).toBe('5000.00')
    expect(untouched.paymentStatus).toBe('UNPAID')
  })

  test('撤销收款恢复资金与应收余额，且保留原单据与核销关系', async ({ request }) => {
    const suffix = uniqueSuffix()
    const customer = await createCustomer(request, `撤销客户-${suffix}`)
    const account = await createAccount(request, `撤销账户-${suffix}`, '0.00')
    const target = await createReceivable(request, {
      customerId: customer.id,
      amount: '2000.00',
      dueDate: today(),
      label: `撤销应收-${suffix}`,
    })
    const created = await apiPost<{ id: string }>(request, '/receivable/receipts', {
      customerId: Number(customer.id),
      receiptDate: today(),
      accountId: Number(account.id),
      actualAmount: '2000.00',
      allocations: [{ receivableId: Number(target.id), amount: '2000.00' }],
      idempotencyKey: idempotencyKey('sk'),
    })
    expect(created.status).toBe(200)
    expect(await accountBalance(request, account.id)).toBe('2000.00')

    // 已有核销的应收单禁止直接撤销
    const voidReceivableAttempt = await apiPost(request, `/receivable/receivables/${target.id}/void`, {
      voidDate: today(),
      reason: '尝试撤销',
    })
    expect(voidReceivableAttempt.status).toBe(409)

    const voided = await apiPost(request, `/receivable/receipts/${created.data.id}/void`, {
      voidDate: today(),
      reason: '收款退回',
    })
    expect(voided.status).toBe(200)

    // 资金与应收余额恢复；原单据与核销明细保留（状态 REVERSED）
    expect(await accountBalance(request, account.id)).toBe('0.00')
    const restored = await receivable(request, target.id)
    expect(restored.outstandingAmount).toBe('2000.00')
    expect(restored.paymentStatus).toBe('UNPAID')

    const receiptDetail = await apiGet<{ status: string; allocations: { status: string }[] }>(
      request,
      `/receivable/receipts/${created.data.id}`,
    )
    expect(receiptDetail.data.status).toBe('VOIDED')
    expect(receiptDetail.data.allocations[0]?.status).toBe('REVERSED')
  })

  test('非法金额与缺失幂等键返回 400（不产生任何记账）', async ({ request }) => {
    const suffix = uniqueSuffix()
    const customer = await createCustomer(request, `非法客户-${suffix}`)
    const account = await createAccount(request, `非法账户-${suffix}`, '0.00')

    const negative = await apiPost(request, '/receivable/receivables', {
      customerId: Number(customer.id),
      accountingMonth: currentMonth(),
      statementDate: today(),
      amount: '-100',
      idempotencyKey: idempotencyKey('ar'),
    })
    expect(negative.status).toBe(400)

    const noKey = await apiPost(request, '/receivable/receivables', {
      customerId: Number(customer.id),
      accountingMonth: currentMonth(),
      statementDate: today(),
      amount: '100.00',
      idempotencyKey: '',
    })
    expect(noKey.status).toBe(400)

    const future = await apiPost(request, '/receivable/receivables', {
      customerId: Number(customer.id),
      accountingMonth: '2099-01',
      statementDate: today(),
      amount: '100.00',
      idempotencyKey: idempotencyKey('ar'),
    })
    expect(future.status).toBe(400)
    expect(await accountBalance(request, account.id)).toBe('0.00')
  })
})
