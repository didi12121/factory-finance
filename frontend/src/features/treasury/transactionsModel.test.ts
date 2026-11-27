/**
 * 资金流水视图模型测试（Agent E / P02-E）—— 真实断言：过滤结果行数/条目、金额、汇总口径、详情内容。
 *
 * 覆盖任务要求：
 * - 搜索/日期/账户/类型/方向/内部转账过滤（经 usePrototypeStore 真实过滤语义）；
 * - 汇总口径（单账户真实 IN/OUT vs 工厂整体排除内部转账）；
 * - 清空筛选恢复全量；
 * - 详情内容（全部字段/备注/关联流水/收款单回溯）；
 * - 财务红线：单条流水金额恒正、方向由 direction 表达、净流入 = subtractAmounts。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { FundTransaction, PageResult } from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import { compareAmounts } from '@/utils/decimal'
import {
  buildTransactionDetailModel,
  computeTransactionSummary,
  emptyFilterState,
  hasActiveFilters,
  resolveTransactionQuery,
  type TransactionDetailContext,
  type TransactionsFilterState,
} from './transactionsModel'

type Store = ReturnType<typeof usePrototypeStore>

let store: Store

function setupStore(): Store {
  setActivePinia(createPinia())
  return usePrototypeStore()
}

/** 用筛选状态经真实 Store 查询取回命中流水 */
async function fetchRows(filters: TransactionsFilterState): Promise<FundTransaction[]> {
  const query = resolveTransactionQuery(filters)
  if (query === null) {
    return []
  }
  return (await store.listFundTransactions(query)).items
}

function detailContext(): TransactionDetailContext {
  return {
    accountName: (accountId) => store.accountById(accountId)?.name ?? null,
    customerName: (customerId) => store.customerById(customerId)?.name ?? null,
    receiptDetailById: (receiptId) => store.receiptDetailById(receiptId),
    receivableViewById: (receivableId) => store.receivableViewById(receivableId),
  }
}

function ids(rows: FundTransaction[]): string[] {
  return rows.map((item) => item.id).sort()
}

beforeEach(() => {
  store = setupStore()
})

describe('资金流水过滤（真实过滤语义，经 usePrototypeStore）', () => {
  it('清空筛选（默认状态）返回全部 22 条，且 hasActiveFilters 为 false', async () => {
    const filters = emptyFilterState()
    expect(hasActiveFilters(filters)).toBe(false)
    const rows = await fetchRows(filters)
    expect(rows.length).toBe(22)
  })

  it('关键字过滤：流水编号精确命中 1 条 / 交易对手命中 3 条 / 备注命中 4 条', async () => {
    const byNo = await fetchRows({ ...emptyFilterState(), keyword: 'FT-2026-0010' })
    expect(ids(byNo)).toEqual(['txn-010'])

    const byCounterparty = await fetchRows({ ...emptyFilterState(), keyword: '示例客户 B' })
    expect(ids(byCounterparty)).toEqual(['txn-008', 'txn-010', 'txn-016'])

    const byRemark = await fetchRows({ ...emptyFilterState(), keyword: '内部转账演示' })
    expect(ids(byRemark)).toEqual(['txn-005', 'txn-006', 'txn-017', 'txn-018'])
  })

  it('日期范围过滤（闭区间）：2026-11-01 ~ 2026-11-10 命中 4 条', async () => {
    const rows = await fetchRows({
      ...emptyFilterState(),
      dateFrom: '2026-11-01',
      dateTo: '2026-11-10',
    })
    expect(ids(rows)).toEqual(['txn-010', 'txn-011', 'txn-012', 'txn-013'])
  })

  it('日期范围单端不限：from=2026-11-25 命中 3 条', async () => {
    const rows = await fetchRows({ ...emptyFilterState(), dateFrom: '2026-11-25' })
    expect(ids(rows)).toEqual(['txn-020', 'txn-021', 'txn-022'])
  })

  it('资金账户过滤：微信账户 2 条 / 停用账户 0 条', async () => {
    const wechat = await fetchRows({ ...emptyFilterState(), accountId: 'acct-wechat' })
    expect(ids(wechat)).toEqual(['txn-006', 'txn-008'])

    const alipay = await fetchRows({ ...emptyFilterState(), accountId: 'acct-alipay' })
    expect(alipay.length).toBe(0)
  })

  it('业务类型过滤：加工费回款 8 条 / 工资支出 3 条', async () => {
    const receipt = await fetchRows({
      ...emptyFilterState(),
      transactionType: 'PROCESSING_FEE_RECEIPT',
    })
    expect(receipt.length).toBe(8)

    const salary = await fetchRows({ ...emptyFilterState(), transactionType: 'SALARY' })
    expect(ids(salary)).toEqual(['txn-003', 'txn-009', 'txn-022'])
  })

  it('流水方向过滤：IN 11 条 / OUT 11 条', async () => {
    const inflow = await fetchRows({ ...emptyFilterState(), direction: 'IN' })
    expect(inflow.length).toBe(11)
    expect(inflow.every((item) => item.direction === 'IN')).toBe(true)

    const outflow = await fetchRows({ ...emptyFilterState(), direction: 'OUT' })
    expect(outflow.length).toBe(11)
    expect(outflow.every((item) => item.direction === 'OUT')).toBe(true)
  })

  it('内部转账过滤（方向快捷筛选映射业务类型）：4 条成对流水', async () => {
    const rows = await fetchRows({ ...emptyFilterState(), direction: 'TRANSFER' })
    expect(ids(rows)).toEqual(['txn-005', 'txn-006', 'txn-017', 'txn-018'])
    expect(rows.every((item) => item.transactionType === 'INTERNAL_TRANSFER')).toBe(true)
    expect(rows.every((item) => item.transferGroupId !== null)).toBe(true)
  })

  it('组合过滤：现金账户 + 流出 4 条；冲突组合（内部转账 + 工资）确定为空', async () => {
    const combined = await fetchRows({
      ...emptyFilterState(),
      accountId: 'acct-cash',
      direction: 'OUT',
    })
    expect(ids(combined)).toEqual(['txn-004', 'txn-005', 'txn-012', 'txn-021'])

    const conflict: TransactionsFilterState = {
      ...emptyFilterState(),
      transactionType: 'SALARY',
      direction: 'TRANSFER',
    }
    expect(resolveTransactionQuery(conflict)).toBeNull()
    expect((await fetchRows(conflict)).length).toBe(0)
  })

  it('查询契约映射：关键字/日期区间/账户/类型/方向各字段正确落到 FundTransactionListQuery', () => {
    const query = resolveTransactionQuery({
      keyword: ' 示例客户 ',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      accountId: 'acct-bank',
      transactionType: 'SALARY',
      direction: 'OUT',
    })
    expect(query).not.toBeNull()
    expect(query?.keyword).toBe('示例客户')
    expect(query?.dateRange).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(query?.accountId).toBe('acct-bank')
    expect(query?.transactionType).toBe('SALARY')
    expect(query?.direction).toBe('OUT')

    const transferQuery = resolveTransactionQuery({
      ...emptyFilterState(),
      direction: 'TRANSFER',
      transactionType: 'INTERNAL_TRANSFER',
    })
    expect(transferQuery?.transactionType).toBe('INTERNAL_TRANSFER')
  })
})

describe('汇总口径（单账户真实 IN/OUT vs 整体排除内部转账）', () => {
  it('工厂整体口径：排除内部转账与已作废流水，净流入为负（subtractAmounts）', async () => {
    const rows = await fetchRows(emptyFilterState())
    const summary = computeTransactionSummary(rows, null)
    expect(summary.inflow).toBe('97046.51')
    expect(summary.outflow).toBe('145385.06')
    expect(summary.net).toBe('-48338.55')
    // 22 条命中：21 条已入账 − 4 条内部转账 = 17 条计入；1 条已作废不计入
    expect(summary.countedRows).toBe(17)
    expect(summary.scopeText).toContain('工厂整体外部收付')
    expect(summary.scopeText).toContain('已排除内部转账')
    expect(summary.scopeText).toContain('已作废不计入')
    expect(summary.countText).toBe('当前筛选命中 22 条流水，其中 17 条计入汇总。')
  })

  it('单账户口径（示例银行账户）：含内部转账划转的真实 IN/OUT', async () => {
    const rows = await fetchRows({ ...emptyFilterState(), accountId: 'acct-bank' })
    const summary = computeTransactionSummary(rows, '示例银行账户')
    expect(summary.inflow).toBe('84045.66')
    expect(summary.outflow).toBe('152500.50')
    expect(summary.net).toBe('-68454.84')
    expect(summary.countedRows).toBe(12)
    expect(summary.scopeText).toContain('示例银行账户')
    expect(summary.scopeText).toContain('含内部转账账户间划转')
  })

  it('单账户口径（示例现金账户）：转入/转出划转均计入该账户真实变动', async () => {
    const rows = await fetchRows({ ...emptyFilterState(), accountId: 'acct-cash' })
    const summary = computeTransactionSummary(rows, '示例现金账户')
    expect(summary.inflow).toBe('14800.35')
    expect(summary.outflow).toBe('4884.56')
    expect(summary.net).toBe('9915.79')
    expect(summary.countedRows).toBe(7)
  })

  it('整体口径下筛选内部转账：划转不计收支，汇总为 0.00（口径显式说明）', async () => {
    const rows = await fetchRows({ ...emptyFilterState(), direction: 'TRANSFER' })
    const summary = computeTransactionSummary(rows, null)
    expect(summary.inflow).toBe('0.00')
    expect(summary.outflow).toBe('0.00')
    expect(summary.net).toBe('0.00')
    expect(summary.countedRows).toBe(0)
    expect(summary.countText).toBe('当前筛选命中 4 条流水，其中 0 条计入汇总。')
  })

  it('单账户 + 内部转账方向：银行账户转出划转 10,000.00 计入流出', async () => {
    const rows = await fetchRows({
      ...emptyFilterState(),
      accountId: 'acct-bank',
      direction: 'TRANSFER',
    })
    const summary = computeTransactionSummary(rows, '示例银行账户')
    expect(summary.inflow).toBe('0.00')
    expect(summary.outflow).toBe('10000.00')
    expect(summary.net).toBe('-10000.00')
    expect(summary.countedRows).toBe(1)
  })

  it('已作废流水不计入汇总（作废 500.00 采购支出不进流出）', async () => {
    const rows = await fetchRows({ ...emptyFilterState(), direction: 'OUT' })
    const summary = computeTransactionSummary(rows, null)
    // OUT 11 条中 txn-020 已作废（500.00）与 2 条内部转账转出均不计入
    expect(summary.countedRows).toBe(8)
    expect(summary.outflow).toBe('145385.06')
  })
})

describe('财务红线（数据不变量）', () => {
  it('单条流水金额恒正，收付方向由 direction 表达（IN/OUT 二选一）', async () => {
    const rows = await fetchRows(emptyFilterState())
    for (const txn of rows) {
      expect(compareAmounts(txn.amount, '0'), `${txn.transactionNo} 金额必须为正`).toBe(1)
      expect(txn.amount.startsWith('-')).toBe(false)
      expect(txn.direction === 'IN' || txn.direction === 'OUT').toBe(true)
    }
  })

  it('内部转账成对流水同额同组（transferGroupId 派对），整体净变化为 0', async () => {
    const rows = await fetchRows({ ...emptyFilterState(), direction: 'TRANSFER' })
    const groups = new Map<string, FundTransaction[]>()
    for (const txn of rows) {
      const key = txn.transferGroupId ?? ''
      groups.set(key, [...(groups.get(key) ?? []), txn])
    }
    expect(groups.size).toBe(2)
    for (const pair of groups.values()) {
      expect(pair.length).toBe(2)
      expect(compareAmounts(pair[0]!.amount, pair[1]!.amount)).toBe(0)
      expect(pair[0]!.direction === pair[1]!.direction).toBe(false)
    }
  })
})

describe('交易详情模型（全部字段 + 备注 + 关联流水 + 收款单回溯）', () => {
  it('内部转账流水：全部字段 + 关联流水为另一方向账户流水（transferGroupId 派对）', async () => {
    const rows = await fetchRows(emptyFilterState())
    const txn = rows.find((item) => item.id === 'txn-017')
    expect(txn).toBeDefined()
    const model = buildTransactionDetailModel(txn!, detailContext(), rows)

    const rowValue = (key: string): string => {
      const row = model.rows.find((item) => item.key === key)
      expect(row, `缺少详情字段 ${key}`).toBeDefined()
      return row!.value
    }
    expect(rowValue('transactionNo')).toBe('FT-2026-0017')
    expect(rowValue('id')).toBe('txn-017')
    expect(rowValue('transactionType')).toBe('内部转账')
    expect(rowValue('tradeDate')).toBe('2026-11-20')
    expect(rowValue('account')).toBe('示例银行账户')
    expect(rowValue('counterparty')).toBe('示例现金账户')
    expect(rowValue('direction')).toBe('流出（OUT）')
    expect(rowValue('amount')).toBe('10000.00')
    expect(rowValue('sourceDoc')).toBe('内部转账单')
    expect(rowValue('sourceDocId')).toBe('tg-001')
    expect(rowValue('transferGroupId')).toBe('tg-001')
    expect(rowValue('status')).toBe('已入账')
    expect(rowValue('createdAt')).toBe('2026-11-20T11:00:00')
    expect(rowValue('remark')).toBe('内部转账演示（成对流水）')

    expect(model.transferPartners.map((item) => item.id)).toEqual(['txn-018'])
    expect(model.transferPartners[0]?.direction).toBe('IN')
    expect(model.receipt).toBeNull()
  })

  it('加工费回款流水：来源收款单回溯（收款单编号/客户/核销去向）', async () => {
    const rows = await fetchRows(emptyFilterState())
    const txn = rows.find((item) => item.id === 'txn-010')
    const model = buildTransactionDetailModel(txn!, detailContext(), rows)

    const sourceDoc = model.rows.find((item) => item.key === 'sourceDoc')
    expect(sourceDoc?.value).toBe('收款单 SK-2026-0002')

    expect(model.receipt).not.toBeNull()
    expect(model.receipt?.receiptNo).toBe('SK-2026-0002')
    expect(model.receipt?.customerName).toBe('示例客户 B')
    expect(model.receipt?.actualAmount).toBe('8000.00')
    expect(model.receipt?.allocations).toEqual([
      { receivableId: 'ar-004', statementNo: 'AR-2026-0004', allocationAmount: '8000.00' },
    ])
    expect(model.transferPartners.length).toBe(0)
  })

  it('手工录入流水：来源单据/内部转账组为占位符，无关联流水、无收款单回溯', async () => {
    const rows = await fetchRows(emptyFilterState())
    const txn = rows.find((item) => item.id === 'txn-021')
    const model = buildTransactionDetailModel(txn!, detailContext(), rows)

    const rowValue = (key: string): string =>
      model.rows.find((item) => item.key === key)?.value ?? ''
    expect(rowValue('sourceDoc')).toBe('手工录入（无来源单据）')
    expect(rowValue('sourceDocId')).toBe('—')
    expect(rowValue('transferGroupId')).toBe('—')
    expect(rowValue('remark')).toBe('手工录入其他支出演示')
    expect(model.transferPartners.length).toBe(0)
    expect(model.receipt).toBeNull()
  })

  it('已作废流水详情状态为「已作废」', async () => {
    const rows = await fetchRows(emptyFilterState())
    const txn = rows.find((item) => item.id === 'txn-020')
    const model = buildTransactionDetailModel(txn!, detailContext(), rows)
    const statusRow = model.rows.find((item) => item.key === 'status')
    expect(statusRow?.value).toBe('已作废')
    expect(statusRow?.tone).toBe('muted')
  })
})

describe('PageResult 边界（数据源契约）', () => {
  it('全量查询 page=1/size=500 返回 22 条且 total 一致', async () => {
    const result: PageResult<FundTransaction> = await store.listFundTransactions({
      page: 1,
      size: 500,
    })
    expect(result.total).toBe(22)
    expect(result.items.length).toBe(22)
  })
})
