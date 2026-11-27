/**
 * usePrototypeStore 单一数据源测试（内存 Mock + 原子确认 + 幂等）。
 *
 * 覆盖任务要求的全部场景：新建应收不增加现金、单张/多张/多次回款核销、跨客户/超额/
 * 重复核销项/无效账户/非法金额拒绝、未分配金额不能确认、幂等重复确认与同键不同参数拒绝、
 * 失败零状态变化、0.01 元级核销、账户余额重算、部分回款与逾期并存、日期区间过滤、
 * 回款不重复增加收入、自动分配优先级、跨模块验证场景（A 8,000 + B 12,000 收 15,000）。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ConfirmReceiptCommand, CreateReceivableCommand } from '../contracts'
import { recomputeAccountBalance } from '../domain/treasury'
import { isPrototypeBusinessError } from '../repository/prototypeErrors'
import { usePrototypeStore } from '../stores/prototype'
import { captureBusinessErrors, expectErrorContaining } from './helpers'

type Store = ReturnType<typeof usePrototypeStore>

function setupStore(): Store {
  setActivePinia(createPinia())
  return usePrototypeStore()
}

function makeConfirmCommand(overrides: Partial<ConfirmReceiptCommand> = {}): ConfirmReceiptCommand {
  return {
    idempotencyKey: 'test-key-1',
    customerId: 'cust-a',
    receiptDate: '2026-11-30',
    accountId: 'acct-bank',
    actualAmount: '100.00',
    externalRef: null,
    remark: null,
    allocations: [],
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
    incomeNov: store.dashboardSummary.periodProcessingFeeIncome,
  }
}

describe('usePrototypeStore — 初始状态与单一数据源', () => {
  let store: Store
  beforeEach(() => {
    store = setupStore()
  })

  it('初始规模与基准金额：应收 24 / 收款 8 / 流水 22 / 核销 10，资金 77,661.45、未收 402,567.87', () => {
    expect(store.customers.length).toBe(5)
    expect(store.fundAccounts.length).toBe(4)
    expect(store.receivables.length).toBe(24)
    expect(store.receipts.length).toBe(8)
    expect(store.fundTransactions.length).toBe(22)
    expect(store.receiptAllocations.length).toBe(10)
    expect(store.totalFundBalance).toBe('77661.45')
    expect(store.dashboardSummary.totalReceivableOutstanding).toBe('402567.87')
  })

  it('账户余额视图与流水重算一致（余额不缓存）', () => {
    expect(store.accountBalanceViews.length).toBe(4)
    for (const item of store.accountBalanceViews) {
      const recomputed = recomputeAccountBalance(
        store.fundAccounts.find((account) => account.id === item.account.id)!,
        store.fundTransactions,
      )
      expect(item.balance).toBe(recomputed)
    }
    expect(store.accountBalanceOf('acct-bank')).toBe('31545.16')
    expect(store.accountBalanceOf('acct-none')).toBeNull()
  })

  it('resetDemoData 恢复初始状态（跨模块验证场景可重复）', async () => {
    await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'reset-check',
        actualAmount: '15000.00',
        allocations: [
          { receivableId: 'ar-001', allocationAmount: '8000.00' },
          { receivableId: 'ar-002', allocationAmount: '7000.00' },
        ],
      }),
    )
    expect(store.receipts.length).toBe(9)
    store.resetDemoData()
    expect(snapshot(store)).toEqual({
      receivables: 24,
      receipts: 8,
      transactions: 22,
      allocations: 10,
      totalFundBalance: '77661.45',
      outstanding: '402567.87',
      incomeNov: '99278.32',
    })
  })
})

describe('createReceivable', () => {
  let store: Store
  beforeEach(() => {
    store = setupStore()
  })

  it('新建应收单不增加现金、不建收款单、不建流水、不自动结清', async () => {
    const before = snapshot(store)
    const receivable = await store.createReceivable({
      customerId: 'cust-b',
      accountingMonth: '2026-11',
      statementDate: '2026-11-29',
      dueDate: null,
      amount: '1234.56',
      remark: null,
    })
    expect(receivable.id).toBe('ar-025')
    expect(receivable.statementNo).toBe('AR-2026-0025')
    expect(receivable.originalAmount).toBe('1234.56')
    const view = store.receivableViewById(receivable.id)
    expect(view?.summary.status).toBe('UNPAID')
    expect(view?.summary.paidAmount).toBe('0.00')
    expect(store.totalFundBalance).toBe(before.totalFundBalance)
    expect(store.receipts.length).toBe(before.receipts)
    expect(store.fundTransactions.length).toBe(before.transactions)
    expect(store.receiptAllocations.length).toBe(before.allocations)
    expect(store.receivables.length).toBe(25)

    const again = await store.createReceivable({
      customerId: 'cust-b',
      accountingMonth: '2026-11',
      statementDate: '2026-11-30',
      dueDate: null,
      amount: '0.01',
      remark: null,
    })
    expect(again.statementNo).toBe('AR-2026-0026')
    expect(again.id).toBe('ar-026')
  })

  it('参数校验拒绝：客户不存在/停用、月份非法/未来月份、日期非法/未来日期、到期日早于对账日、金额非正/非法', async () => {
    const base: Omit<CreateReceivableCommand, 'customerId'> = {
      accountingMonth: '2026-11',
      statementDate: '2026-11-29',
      dueDate: null,
      amount: '100.00',
      remark: null,
    }
    type Case = Omit<CreateReceivableCommand, 'customerId'> & {
      customerId: string
      expectFragment: string
    }
    const cases: Case[] = [
      { customerId: 'cust-none', expectFragment: '客户不存在', ...base },
      { customerId: 'cust-e', expectFragment: '客户已停用', ...base },
      { customerId: 'cust-b', expectFragment: '会计期间格式非法', ...base, accountingMonth: '2026-13' },
      { customerId: 'cust-b', expectFragment: '会计期间不得晚于演示基准月 2026-11', ...base, accountingMonth: '2026-12' },
      { customerId: 'cust-b', expectFragment: '对账日期格式非法', ...base, statementDate: '2026-02-30' },
      { customerId: 'cust-b', expectFragment: '对账日期不得晚于演示基准日 2026-11-30', ...base, statementDate: '2026-12-05' },
      { customerId: 'cust-b', expectFragment: '到期日格式非法', ...base, dueDate: 'bad-date' },
      { customerId: 'cust-b', expectFragment: '到期日不得早于对账日期', ...base, dueDate: '2026-11-01' },
      { customerId: 'cust-b', expectFragment: '应收金额必须大于 0', ...base, amount: '0' },
      { customerId: 'cust-b', expectFragment: '应收金额格式非法', ...base, amount: '12.345' },
    ]
    for (const testCase of cases) {
      const { expectFragment, ...command } = testCase
      const errors = await captureBusinessErrors(() => store.createReceivable(command))
      expectErrorContaining(errors, expectFragment)
    }
    expect(store.receivables.length).toBe(24)
  })
})

describe('confirmReceipt — 原子确认与核销规则', () => {
  let store: Store
  beforeEach(() => {
    store = setupStore()
  })

  it('单张应收单回款：全额核销 → SETTLED，账户余额 +5,000.00，仅 +1 条资金流入', async () => {
    const before = snapshot(store)
    const receipt = await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'single-1',
        customerId: 'cust-b',
        actualAmount: '5000.00',
        allocations: [{ receivableId: 'ar-005', allocationAmount: '5000.00' }],
      }),
    )
    expect(receipt.receiptNo).toBe('SK-2026-0009')
    expect(receipt.actualAmount).toBe('5000.00')
    const view = store.receivableViewById('ar-005')
    expect(view?.summary.status).toBe('SETTLED')
    expect(view?.summary.outstandingAmount).toBe('0.00')
    expect(store.accountBalanceOf('acct-bank')).toBe('36545.16')
    expect(store.totalFundBalance).toBe('82661.45')
    expect(store.receipts.length).toBe(Number(before.receipts) + 1)
    expect(store.fundTransactions.length).toBe(Number(before.transactions) + 1)
    expect(store.receiptAllocations.length).toBe(Number(before.allocations) + 1)
  })

  it('多张应收单核销：一张收款核销 ar-004 与 ar-005（多对多的一半）', async () => {
    const receipt = await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'multi-ar-1',
        customerId: 'cust-b',
        actualAmount: '13000.00',
        allocations: [
          { receivableId: 'ar-005', allocationAmount: '5000.00' },
          { receivableId: 'ar-004', allocationAmount: '8000.00' },
        ],
      }),
    )
    expect(receipt.actualAmount).toBe('13000.00')
    expect(store.receivableViewById('ar-005')?.summary.status).toBe('SETTLED')
    // ar-004 原 20,000.00，已收 12,000.00（历史）+ 8,000.00 = 结清
    const ar4 = store.receivableViewById('ar-004')
    expect(ar4?.summary.paidAmount).toBe('20000.00')
    expect(ar4?.summary.status).toBe('SETTLED')
    expect(store.receiptAllocations.length).toBe(12)
  })

  it('多次回款核销同一应收单：ar-004 分两笔 3,000.00 + 5,000.00 收清剩余 8,000.00', async () => {
    await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'twice-1',
        customerId: 'cust-b',
        actualAmount: '3000.00',
        allocations: [{ receivableId: 'ar-004', allocationAmount: '3000.00' }],
      }),
    )
    const partial = store.receivableViewById('ar-004')
    expect(partial?.summary.status).toBe('PARTIALLY_PAID')
    expect(partial?.summary.paidAmount).toBe('15000.00')
    expect(partial?.summary.outstandingAmount).toBe('5000.00')

    await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'twice-2',
        customerId: 'cust-b',
        receiptDate: '2026-11-29',
        actualAmount: '5000.00',
        allocations: [{ receivableId: 'ar-004', allocationAmount: '5000.00' }],
      }),
    )
    const settled = store.receivableViewById('ar-004')
    expect(settled?.summary.status).toBe('SETTLED')
    expect(settled?.summary.outstandingAmount).toBe('0.00')
    expect(store.receipts.length).toBe(10)
    expect(store.fundTransactions.length).toBe(24)
  })

  it('跨客户核销拒绝且状态不变', async () => {
    const before = snapshot(store)
    const errors = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'cross-customer',
          customerId: 'cust-b',
          actualAmount: '100.00',
          allocations: [{ receivableId: 'ar-001', allocationAmount: '100.00' }],
        }),
      ),
    )
    expectErrorContaining(errors, '不允许跨客户核销')
    expect(snapshot(store)).toEqual(before)
  })

  it('超额核销拒绝：核销总额 > 实收、累计核销 > 原始应收', async () => {
    const before = snapshot(store)
    const overTotal = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'over-total',
          actualAmount: '1000.00',
          allocations: [{ receivableId: 'ar-001', allocationAmount: '1200.00' }],
        }),
      ),
    )
    expectErrorContaining(overTotal, '核销总额超过实际收款金额')

    const overOriginal = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'over-original',
          actualAmount: '9000.00',
          allocations: [{ receivableId: 'ar-001', allocationAmount: '9000.00' }],
        }),
      ),
    )
    expectErrorContaining(overOriginal, '累计核销金额超过应收单原始金额')
    expect(snapshot(store)).toEqual(before)
  })

  it('重复核销项拒绝：同一应收单重复分配', async () => {
    const before = snapshot(store)
    const errors = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'dup-item',
          actualAmount: '8000.00',
          allocations: [
            { receivableId: 'ar-001', allocationAmount: '4000.00' },
            { receivableId: 'ar-001', allocationAmount: '4000.00' },
          ],
        }),
      ),
    )
    expectErrorContaining(errors, '重复的应收单')
    expect(snapshot(store)).toEqual(before)
  })

  it('无效账户拒绝：账户不存在 / 账户停用', async () => {
    const before = snapshot(store)
    const plan = [{ receivableId: 'ar-001', allocationAmount: '100.00' }]
    const missing = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({ idempotencyKey: 'acct-none', accountId: 'acct-none', actualAmount: '100.00', allocations: plan }),
      ),
    )
    expectErrorContaining(missing, '资金账户不存在')
    const disabled = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({ idempotencyKey: 'acct-off', accountId: 'acct-alipay', actualAmount: '100.00', allocations: plan }),
      ),
    )
    expectErrorContaining(disabled, '资金账户已停用')
    expect(snapshot(store)).toEqual(before)
  })

  it('非法金额拒绝：实际收款与核销金额的格式/正数校验', async () => {
    const before = snapshot(store)
    for (const actualAmount of ['abc', '0', '-5.00', '100.005']) {
      const errors = await captureBusinessErrors(() =>
        store.confirmReceipt(
          makeConfirmCommand({
            idempotencyKey: `bad-amount-${actualAmount}`,
            actualAmount,
            allocations: [{ receivableId: 'ar-001', allocationAmount: '1.00' }],
          }),
        ),
      )
      expect(errors.length).toBeGreaterThan(0)
    }
    const badAllocation = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'bad-allocation',
          actualAmount: '100.00',
          allocations: [{ receivableId: 'ar-001', allocationAmount: '0.005' }],
        }),
      ),
    )
    expectErrorContaining(badAllocation, '核销金额')
    expect(snapshot(store)).toEqual(before)
  })

  it('未分配金额不能确认：Σ核销 < 实收 拒绝确认并提示预收款规则 Phase 2', async () => {
    const before = snapshot(store)
    const errors = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'unallocated',
          actualAmount: '10000.00',
          allocations: [{ receivableId: 'ar-002', allocationAmount: '8000.00' }],
        }),
      ),
    )
    expectErrorContaining(errors, '存在未分配金额 2000.00')
    expect(snapshot(store)).toEqual(before)
  })

  it('0.01 元级核销：0.01 收款结清 0.01 应收（ar-010）', async () => {
    const receipt = await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'tiny-1',
        customerId: 'cust-c',
        accountId: 'acct-cash',
        actualAmount: '0.01',
        allocations: [{ receivableId: 'ar-010', allocationAmount: '0.01' }],
      }),
    )
    expect(receipt.actualAmount).toBe('0.01')
    const view = store.receivableViewById('ar-010')
    expect(view?.summary.status).toBe('SETTLED')
    expect(view?.summary.outstandingAmount).toBe('0.00')
    expect(store.accountBalanceOf('acct-cash')).toBe('29915.80')
  })

  it('validateReceiptAllocation：合法方案返回空数组（可确认）', async () => {
    const errors = await store.validateReceiptAllocation(
      makeConfirmCommand({
        idempotencyKey: 'validate-ok',
        actualAmount: '8000.00',
        allocations: [{ receivableId: 'ar-001', allocationAmount: '8000.00' }],
      }),
    )
    expect(errors).toEqual([])
  })
})

describe('confirmReceipt — 幂等与原子性', () => {
  let store: Store
  beforeEach(() => {
    store = setupStore()
  })

  it('重复确认不产生重复流水/重复收款单（同键同参返回原结果）', async () => {
    const command = makeConfirmCommand({
      idempotencyKey: 'idem-1',
      actualAmount: '15000.00',
      allocations: [
        { receivableId: 'ar-001', allocationAmount: '8000.00' },
        { receivableId: 'ar-002', allocationAmount: '7000.00' },
      ],
    })
    const first = await store.confirmReceipt(command)
    const countsAfterFirst = snapshot(store)
    const second = await store.confirmReceipt(command)
    expect(second.id).toBe(first.id)
    expect(second.receiptNo).toBe(first.receiptNo)
    expect(snapshot(store)).toEqual(countsAfterFirst)
    expect(store.receipts.length).toBe(9)
    expect(store.fundTransactions.length).toBe(23)
    expect(store.receiptAllocations.length).toBe(12)
  })

  it('同一幂等 ID 不同参数拒绝（哈希业务参数对比，CONFLICT）', async () => {
    await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'idem-2',
        actualAmount: '8000.00',
        allocations: [{ receivableId: 'ar-001', allocationAmount: '8000.00' }],
      }),
    )
    const before = snapshot(store)
    const errors = await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'idem-2',
          actualAmount: '12000.00',
          allocations: [{ receivableId: 'ar-002', allocationAmount: '12000.00' }],
        }),
      ),
    )
    expect(errors[0]?.code).toBe('CONFLICT')
    expectErrorContaining(errors, '业务参数不一致')
    expect(snapshot(store)).toEqual(before)
  })

  it('失败操作零状态变化：任何校验失败后收款单/流水/核销/余额/应收/收入全部不变', async () => {
    const before = snapshot(store)
    await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'fail-1',
          customerId: 'cust-c',
          actualAmount: '100.00',
          allocations: [{ receivableId: 'ar-001', allocationAmount: '100.00' }],
        }),
      ),
    )
    await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'fail-2',
          actualAmount: '100.00',
          allocations: [{ receivableId: 'ar-999', allocationAmount: '100.00' }],
        }),
      ),
    )
    await captureBusinessErrors(() =>
      store.confirmReceipt(
        makeConfirmCommand({
          idempotencyKey: 'fail-3',
          receiptDate: '2026-02-30',
          actualAmount: '100.00',
          allocations: [{ receivableId: 'ar-001', allocationAmount: '100.00' }],
        }),
      ),
    )
    expect(snapshot(store)).toEqual(before)
  })
})

describe('查询筛选与派生态势', () => {
  let store: Store
  beforeEach(() => {
    store = setupStore()
  })

  it('部分回款与逾期并存：ar-004 PARTIALLY_PAID + 逾期未收 8,000.00', () => {
    const view = store.receivableViewById('ar-004')
    expect(view?.summary.status).toBe('PARTIALLY_PAID')
    expect(view?.summary.paidAmount).toBe('12000.00')
    expect(view?.summary.outstandingAmount).toBe('8000.00')
    expect(view?.summary.isOverdue).toBe(true)
    const ar5 = store.receivableViewById('ar-005')
    expect(ar5?.summary.isOverdue).toBe(false)
  })

  it('日期区间过滤：流水 11 月 13 条 / 10 月 6 条、应收对账日期 11 月 8 张、收款 10 月 2 张', async () => {
    const novTxns = await store.listFundTransactions({
      page: 1,
      size: 100,
      dateRange: { from: '2026-11-01', to: '2026-11-30' },
    })
    expect(novTxns.total).toBe(13)
    const octTxns = await store.listFundTransactions({
      page: 1,
      size: 100,
      dateRange: { from: '2026-10-01', to: '2026-10-31' },
    })
    expect(octTxns.total).toBe(6)

    const novReceivables = await store.listReceivables({
      page: 1,
      size: 100,
      dateRange: { from: '2026-11-01', to: '2026-11-30' },
    })
    expect(novReceivables.total).toBe(8)

    const octReceipts = await store.listReceipts({
      page: 1,
      size: 100,
      dateRange: { from: '2026-10-01', to: '2026-10-31' },
    })
    expect(octReceipts.total).toBe(2)
  })

  it('应收列表筛选与分页：状态/逾期/客户筛选，24 张分 2 页', async () => {
    const settled = await store.listReceivables({ page: 1, size: 100, status: 'SETTLED' })
    expect(settled.total).toBe(6)
    const overdue = await store.listReceivables({ page: 1, size: 100, overdueOnly: true })
    expect(overdue.total).toBe(6)
    const custA = await store.listReceivables({ page: 1, size: 100, customerId: 'cust-a' })
    expect(custA.total).toBe(3)

    const page1 = await store.listReceivables({ page: 1, size: 20 })
    expect(page1.items.length).toBe(20)
    expect(page1.total).toBe(24)
    const page2 = await store.listReceivables({ page: 2, size: 20 })
    expect(page2.items.length).toBe(4)
    expect(page2.page).toBe(2)

    const invalid = await captureBusinessErrors(() => store.listReceivables({ page: 1, size: 0 }))
    expectErrorContaining(invalid, 'size')
  })

  it('金额排序用精确比较（按未收金额升序首行为 0.01 尾差单）', async () => {
    const result = await store.listReceivables({
      page: 1,
      size: 3,
      status: 'PARTIALLY_PAID',
      sort: { field: 'outstandingAmount', direction: 'ASC' },
    })
    expect(result.items[0]?.receivable.id).toBe('ar-020')
    expect(result.items[0]?.summary.outstandingAmount).toBe('0.01')
  })

  it('自动分配优先级（store）：cust-c 10.00 → ar-010 0.01 + ar-009 9.99，且只预览不落状态', async () => {
    const before = snapshot(store)
    const preview = await store.autoAllocateReceipt({ customerId: 'cust-c', actualAmount: '10.00' })
    expect(preview.allocations).toEqual([
      { receivableId: 'ar-010', allocationAmount: '0.01' },
      { receivableId: 'ar-009', allocationAmount: '9.99' },
    ])
    expect(preview.validationErrors).toEqual([])
    expect(snapshot(store)).toEqual(before)
    expect(store.receivableViewById('ar-010')?.summary.status).toBe('UNPAID')
  })
})

describe('财务分离与跨模块验证场景', () => {
  let store: Store
  beforeEach(() => {
    store = setupStore()
  })

  it('回款不重复增加收入：确认回款后期间加工收入不变、实际回款增加', async () => {
    const before = await store.getDashboardSummary({ from: '2026-11-01', to: '2026-11-30' })
    await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'income-check',
        actualAmount: '15000.00',
        allocations: [
          { receivableId: 'ar-001', allocationAmount: '8000.00' },
          { receivableId: 'ar-002', allocationAmount: '7000.00' },
        ],
      }),
    )
    const after = await store.getDashboardSummary({ from: '2026-11-01', to: '2026-11-30' })
    expect(after.periodProcessingFeeIncome).toBe(before.periodProcessingFeeIncome)
    expect(after.periodProcessingFeeIncome).toBe('99278.32')
    expect(after.periodActualReceipts).toBe('52246.01')
  })

  it('股东出资不增加收入：2026-09 加工收入不含 50,000.00 出资', async () => {
    const summary = await store.getDashboardSummary({ from: '2026-09-01', to: '2026-09-30' })
    expect(summary.periodProcessingFeeIncome).toBe('59534.90')
    expect(store.accountBalanceOf('acct-bank')).toBe('31545.16')
  })

  it('跨模块场景：A 8,000.00 + B 12,000.00 收 15,000.00 核销 8,000 + 7,000 后状态与余额正确', async () => {
    // 初始状态（可重复：页面刷新/重置即恢复）
    const initialA = store.receivableViewById('ar-001')
    const initialB = store.receivableViewById('ar-002')
    expect(initialA?.summary.status).toBe('UNPAID')
    expect(initialA?.summary.outstandingAmount).toBe('8000.00')
    expect(initialB?.summary.status).toBe('UNPAID')
    expect(initialB?.summary.outstandingAmount).toBe('12000.00')

    const receipt = await store.confirmReceipt(
      makeConfirmCommand({
        idempotencyKey: 'xmod-scenario',
        customerId: 'cust-a',
        receiptDate: '2026-11-30',
        accountId: 'acct-bank',
        actualAmount: '15000.00',
        externalRef: 'XMOD-REF-001',
        remark: '跨模块验证场景回款',
        allocations: [
          { receivableId: 'ar-001', allocationAmount: '8000.00' },
          { receivableId: 'ar-002', allocationAmount: '7000.00' },
        ],
      }),
    )
    expect(receipt.receiptNo).toBe('SK-2026-0009')
    expect(receipt.actualAmount).toBe('15000.00')

    const arA = store.receivableViewById('ar-001')
    expect(arA?.summary.status).toBe('SETTLED')
    expect(arA?.summary.paidAmount).toBe('8000.00')
    expect(arA?.summary.outstandingAmount).toBe('0.00')

    const arB = store.receivableViewById('ar-002')
    expect(arB?.summary.status).toBe('PARTIALLY_PAID')
    expect(arB?.summary.paidAmount).toBe('7000.00')
    expect(arB?.summary.outstandingAmount).toBe('5000.00')

    // 资金事实：一笔收款只产生一条资金流入
    expect(store.fundTransactions.length).toBe(23)
    expect(store.receipts.length).toBe(9)
    expect(store.receiptAllocations.length).toBe(12)
    expect(store.accountBalanceOf('acct-bank')).toBe('46545.16')
    expect(store.totalFundBalance).toBe('92661.45')

    // 收入 ≠ 回款
    const summary = await store.getDashboardSummary({ from: '2026-11-01', to: '2026-11-30' })
    expect(summary.periodProcessingFeeIncome).toBe('99278.32')
    expect(summary.periodActualReceipts).toBe('52246.01')
    expect(summary.totalReceivableOutstanding).toBe('387567.87')

    // 收款单详情含 2 条核销明细
    const detail = await store.getReceiptById(receipt.id)
    expect(detail?.allocations.length).toBe(2)
    expect(detail?.allocations.map((item) => item.receivableId)).toEqual(['ar-001', 'ar-002'])
    expect(detail?.receipt.fundTransactionId).toBe(receipt.fundTransactionId)

    // 重置后场景恢复（页面刷新等价）
    store.resetDemoData()
    expect(store.receivableViewById('ar-001')?.summary.status).toBe('UNPAID')
    expect(store.receivableViewById('ar-002')?.summary.outstandingAmount).toBe('12000.00')
  })
})

describe('错误契约', () => {
  it('写操作失败抛出 PrototypeBusinessError（携带 BusinessError 列表）', async () => {
    const store = setupStore()
    const error = await store
      .confirmReceipt(makeConfirmCommand({ idempotencyKey: 'err-1', allocations: [] }))
      .then(
        () => null,
        (caught: unknown) => caught,
      )
    expect(isPrototypeBusinessError(error)).toBe(true)
    if (isPrototypeBusinessError(error)) {
      expect(error.primary?.code).toBe('VALIDATION_ERROR')
      expect(error.errors.length).toBeGreaterThan(0)
    }
  })
})
