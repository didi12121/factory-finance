/**
 * 业务日期一致性测试（Task A3，Store/Domain 层强制；创建期语义按主 Agent 裁决与
 * 阶段规范原文校准）：
 * 真实公历校验（无效日期/闰年/边界）、实际到账日期 ≤ DEMO_TODAY（未来收款强制拒绝、
 * 失败零状态变化，Mandatory Regression 4）、新建应收单语义（会计月份/对账日期允许
 * 含未来的真实公历值；到期日可为未来，仅影响逾期派生）、收入确认口径（阶段规范约束点：
 * 未来月/未来确认日期单据不得进入截至当前业务日期的已确认收入，报告层防御性过滤，
 * 视为未确认/未来期间）。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEMO_TODAY, type ConfirmReceiptCommand } from '../contracts'
import { isValidAccountingMonth, isValidLocalDate } from '../domain/dateRules'
import { computeDashboardSummary, type DashboardSourceState } from '../domain/reporting'
import { usePrototypeStore } from '../stores/prototype'
import { captureBusinessErrors, expectErrorContaining } from './helpers'

type Store = ReturnType<typeof usePrototypeStore>

function setupStore(): Store {
  setActivePinia(createPinia())
  return usePrototypeStore()
}

function makeConfirmCommand(overrides: Partial<ConfirmReceiptCommand> = {}): ConfirmReceiptCommand {
  return {
    idempotencyKey: 'date-key-1',
    customerId: 'cust-a',
    receiptDate: '2026-11-30',
    accountId: 'acct-bank',
    actualAmount: '100.00',
    externalRef: null,
    remark: null,
    allocations: [{ receivableId: 'ar-001', allocationAmount: '100.00' }],
    ...overrides,
  }
}

function snapshot(store: Store): Record<string, string | number> {
  return {
    receivables: store.receivables.length,
    receipts: store.receipts.length,
    transactions: store.fundTransactions.length,
    allocations: store.receiptAllocations.length,
    totalFundBalance: store.totalFundBalance,
    outstanding: store.dashboardSummary.totalReceivableOutstanding,
    income: store.dashboardSummary.periodProcessingFeeIncome,
  }
}

describe('isValidLocalDate — 真实公历校验（日期解析）', () => {
  it('无效日期拒绝：2026-02-30 / 2026-13-01 / 2026-11-31 / 非补零 / 空串 / 日期时间串', () => {
    for (const value of [
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-11-00',
      '2026-11-31',
      '2026-2-05',
      '2026-11-3',
      '',
      '2026-11-30T00:00:00',
      '2026/11/30',
      'bad-date',
    ]) {
      expect(isValidLocalDate(value)).toBe(false)
    }
  })

  it('闰年校验：2024-02-29 合法 / 2026-02-29 非法 / 2000-02-29 合法 / 1900-02-29 非法', () => {
    expect(isValidLocalDate('2024-02-29')).toBe(true)
    expect(isValidLocalDate('2026-02-29')).toBe(false)
    expect(isValidLocalDate('2000-02-29')).toBe(true)
    expect(isValidLocalDate('1900-02-29')).toBe(false)
    expect(isValidLocalDate('2024-02-28')).toBe(true)
    expect(isValidLocalDate('2026-02-28')).toBe(true)
  })

  it('边界：DEMO_TODAY 当日合法；会计期间 YYYY-MM 格式校验独立', () => {
    expect(isValidLocalDate(DEMO_TODAY)).toBe(true)
    expect(isValidLocalDate('2026-12-01')).toBe(true) // 合法日期（是否允许由业务规则判定）
    expect(isValidAccountingMonth('2026-11')).toBe(true)
    expect(isValidAccountingMonth('2026-13')).toBe(false)
    expect(isValidAccountingMonth('2026-1')).toBe(false)
  })
})

describe('confirmReceipt — 实际到账日期一致性（未来日期拒绝）', () => {
  let store: Store
  beforeEach(() => {
    store = setupStore()
  })

  it('未来到账日期拒绝：次日（2026-12-01）与更远未来（2027-01-01），明确 BusinessError 且状态不变', async () => {
    const before = snapshot(store)
    for (const receiptDate of ['2026-12-01', '2027-01-01']) {
      const errors = await captureBusinessErrors(() =>
        store.confirmReceipt(
          makeConfirmCommand({ idempotencyKey: `future-${receiptDate}`, receiptDate }),
        ),
      )
      expectErrorContaining(errors, '实际到账日期不得晚于演示基准日 2026-11-30')
      expect(errors[0]?.code).toBe('VALIDATION_ERROR')
    }
    expect(snapshot(store)).toEqual(before)
  })

  it('DEMO_TODAY 当日允许；无效公历日期（2026-02-30 / 2026-13-01）拒绝且状态不变', async () => {
    const before = snapshot(store)
    const ok = await store.confirmReceipt(makeConfirmCommand({ idempotencyKey: 'today' }))
    expect(ok.receiptDate).toBe('2026-11-30')
    expect(store.receipts.length).toBe(Number(before.receipts) + 1)

    const afterOk = snapshot(store)
    for (const receiptDate of ['2026-02-30', '2026-13-01']) {
      const errors = await captureBusinessErrors(() =>
        store.confirmReceipt(
          makeConfirmCommand({ idempotencyKey: `invalid-${receiptDate}`, receiptDate }),
        ),
      )
      expectErrorContaining(errors, '到账日期格式非法')
    }
    expect(snapshot(store)).toEqual(afterOk)
  })

  it('validateReceiptAllocation（确认前校验路径）同样拒绝未来到账日期', async () => {
    const errors = await store.validateReceiptAllocation(
      makeConfirmCommand({ idempotencyKey: 'validate-future', receiptDate: '2026-12-01' }),
    )
    expectErrorContaining(errors, '实际到账日期不得晚于演示基准日 2026-11-30')
  })
})

describe('createReceivable — 会计月份/对账日期/到期日语义（按主 Agent 裁决与阶段规范校准）', () => {
  let store: Store
  beforeEach(() => {
    store = setupStore()
  })

  it('未来月份/未来对账日期允许创建（阶段规范仅约束收入确认）：2026-12 单据创建成功且不增加现金', async () => {
    const before = snapshot(store)
    const created = await store.createReceivable({
      customerId: 'cust-a',
      accountingMonth: '2026-12',
      statementDate: '2026-12-05',
      dueDate: '2026-12-31',
      amount: '5000.00',
      remark: null,
    })
    expect(created.accountingMonth).toBe('2026-12')
    expect(created.statementDate).toBe('2026-12-05')
    expect(store.receivables.length).toBe(Number(before.receivables) + 1)
    // 创建不增加现金/不建收款单/不建流水/不建核销
    expect(store.receipts.length).toBe(before.receipts)
    expect(store.fundTransactions.length).toBe(before.transactions)
    expect(store.receiptAllocations.length).toBe(before.allocations)
    expect(store.totalFundBalance).toBe(before.totalFundBalance)
  })

  it('未来月单据视为未确认/未来期间：创建后本期收入不变，且不计入截至当前业务日期的已确认收入', async () => {
    const before = snapshot(store)
    const created = await store.createReceivable({
      customerId: 'cust-a',
      accountingMonth: '2026-12',
      statementDate: '2026-12-05',
      dueDate: null,
      amount: '5000.00',
      remark: null,
    })
    // 本期（2026-11）已确认收入不变
    expect(store.dashboardSummary.periodProcessingFeeIncome).toBe(before.income)
    // 2026-12 期间同样不确认（当前原型不支持未来收入确认）→ 未确认/未来期间
    const dec = await store.getDashboardSummary({ from: '2026-12-01', to: '2026-12-31' })
    expect(dec.periodProcessingFeeIncome).toBe('0.00')
    // 含未来月的全区间已确认收入 = 仅既有已确认部分（不含 5,000.00 未来单据）
    const wide = await store.getDashboardSummary({ from: '2026-09-01', to: '2026-12-31' })
    expect(wide.periodProcessingFeeIncome).toBe('449614.38')
    // 单据本身作为应收事实存在（未收余额派生正常），仅收入未确认
    const view = store.receivableViewById(created.id)
    expect(view?.summary.status).toBe('UNPAID')
    expect(view?.summary.outstandingAmount).toBe('5000.00')
    expect(view?.summary.integrity?.status).toBe('OK')
  })

  it('未来确认日期单据允许创建但不计已确认收入：statementDate 2026-12-01（month 2026-11）', async () => {
    const before = snapshot(store)
    await store.createReceivable({
      customerId: 'cust-a',
      accountingMonth: '2026-11',
      statementDate: '2026-12-01',
      dueDate: null,
      amount: '700.00',
      remark: null,
    })
    expect(store.dashboardSummary.periodProcessingFeeIncome).toBe(before.income)
    const wide = await store.getDashboardSummary({ from: '2026-09-01', to: '2026-12-31' })
    expect(wide.periodProcessingFeeIncome).toBe('449614.38')
  })

  it('DEMO_TODAY 当日与历史日期允许创建（真实公历边界）', async () => {
    const before = snapshot(store)
    const ok = await store.createReceivable({
      customerId: 'cust-a',
      accountingMonth: '2026-11',
      statementDate: '2026-11-30',
      dueDate: null,
      amount: '100.00',
      remark: null,
    })
    expect(ok.statementDate).toBe('2026-11-30')
    expect(store.receivables.length).toBe(Number(before.receivables) + 1)
    // 当日单据计入已确认收入（2026-11 期间 +100.00）
    expect(store.dashboardSummary.periodProcessingFeeIncome).toBe('99378.32')
  })

  it('到期日期可为未来（仅影响逾期派生）：dueDate 2027-06-30 创建成功且不判逾期', async () => {
    const created = await store.createReceivable({
      customerId: 'cust-a',
      accountingMonth: '2026-11',
      statementDate: '2026-11-29',
      dueDate: '2027-06-30',
      amount: '500.00',
      remark: null,
    })
    const view = store.receivableViewById(created.id)
    expect(view?.summary.isOverdue).toBe(false)
    expect(view?.summary.status).toBe('UNPAID')
  })

  it('真实公历校验进入创建路径：2026-02-30 对账日期 / 2026-13 会计月份拒绝且状态不变', async () => {
    const before = snapshot(store)
    const badDate = await captureBusinessErrors(() =>
      store.createReceivable({
        customerId: 'cust-a',
        accountingMonth: '2026-11',
        statementDate: '2026-02-30',
        dueDate: null,
        amount: '100.00',
        remark: null,
      }),
    )
    expectErrorContaining(badDate, '对账日期格式非法')
    const badMonth = await captureBusinessErrors(() =>
      store.createReceivable({
        customerId: 'cust-a',
        accountingMonth: '2026-13',
        statementDate: '2026-11-29',
        dueDate: null,
        amount: '100.00',
        remark: null,
      }),
    )
    expectErrorContaining(badMonth, '会计期间格式非法')
    expect(snapshot(store)).toEqual(before)
  })
})

describe('收入确认口径 — 报告层防御性过滤（不支持未来收入确认）', () => {
  function sourceWith(receivables: DashboardSourceState['receivables']): DashboardSourceState {
    return { fundAccounts: [], fundTransactions: [], receivables, receipts: [], receiptAllocations: [] }
  }

  function makeReceivable(id: string, accountingMonth: string, statementDate: string, amount: string) {
    return {
      id,
      statementNo: `AR-T-${id}`,
      customerId: 'cust-a',
      accountingMonth,
      statementDate,
      dueDate: null,
      originalAmount: amount,
      remark: null,
      createdAt: '2026-11-30T09:00:00',
    }
  }

  it('未来月/未来确认日期单据不计入截至当前业务日期的已确认收入', () => {
    const source = sourceWith([
      makeReceivable('ar-now', '2026-11', '2026-11-15', '1000.00'),
      makeReceivable('ar-future-month', '2026-12', '2026-12-05', '5000.00'),
      makeReceivable('ar-future-date', '2026-11', '2026-12-01', '700.00'),
    ])
    const nov = computeDashboardSummary(source, { from: '2026-11-01', to: '2026-11-30' })
    expect(nov.periodProcessingFeeIncome).toBe('1000.00')

    // 即使统计区间延伸到未来月，已确认收入口径仍以当前业务日期为界
    const wide = computeDashboardSummary(source, { from: '2026-11-01', to: '2026-12-31' })
    expect(wide.periodProcessingFeeIncome).toBe('1000.00')
  })

  it('截至当前业务日期的合法单据正常计入（DEMO_TODAY 当日单据计入）', () => {
    const source = sourceWith([
      makeReceivable('ar-today', '2026-11', '2026-11-30', '200.00'),
      makeReceivable('ar-old', '2026-09', '2026-09-15', '300.00'),
    ])
    const all = computeDashboardSummary(source, { from: '2026-09-01', to: '2026-11-30' })
    expect(all.periodProcessingFeeIncome).toBe('500.00')
  })

  it('未引入预计收入/预计回款规则：未来单据不计收入且不虚构任何应收余额变动', () => {
    const source = sourceWith([
      makeReceivable('ar-future-month', '2026-12', '2026-12-05', '5000.00'),
    ])
    const summary = computeDashboardSummary(source, { from: '2026-12-01', to: '2026-12-31' })
    // 未来单据不计已确认收入；也不产生预计收入/预计回款等未确认会计口径
    expect(summary.periodProcessingFeeIncome).toBe('0.00')
    expect(summary.periodActualReceipts).toBe('0.00')
    expect(summary.periodActualExpenses).toBe('0.00')
  })
})
