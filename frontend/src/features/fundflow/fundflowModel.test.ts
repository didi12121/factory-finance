import { describe, expect, it } from 'vitest'

import {
  buildTransactionDetailModel,
  emptyFundflowFilters,
  hasActiveFundflowFilters,
  resolveTransactionQuery,
  resolveVoidableSource,
  sourceDocText,
  type FundflowFilterState,
} from './fundflowModel'
import type { FundTransaction } from '@/services/api'

const txn: FundTransaction = {
  id: 't-1',
  transactionNo: 'FT-001',
  transactionType: 'SHAREHOLDER_CONTRIBUTION',
  tradeDate: '2026-11-25',
  accountId: 'acct-1',
  direction: 'IN',
  amount: '1850.39',
  counterparty: '张三',
  sourceDocType: 'CONTRIBUTION',
  sourceDocId: 'c-1',
  transferGroupId: null,
  status: 'RECORDED',
  remark: null,
  createdAt: '2026-11-25T10:00:00',
  voidedAt: null,
}

describe('资金流水筛选 → 查询参数映射', () => {
  it('全部不限时仅携带分页', () => {
    expect(resolveTransactionQuery(emptyFundflowFilters(), 2, 50)).toEqual({ page: 2, size: 50 })
  })

  it('关键字/日期/账户/类型/方向逐项映射（空值省略）', () => {
    const filters: FundflowFilterState = {
      keyword: '  FT-  ',
      dateFrom: '2026-11-01',
      dateTo: '',
      accountId: 'acct-1',
      transactionType: 'SALARY',
      direction: 'OUT',
    }
    expect(resolveTransactionQuery(filters, 1, 20)).toEqual({
      page: 1,
      size: 20,
      keyword: 'FT-',
      from: '2026-11-01',
      accountId: 'acct-1',
      transactionType: 'SALARY',
      direction: 'OUT',
    })
  })

  it('方向「内部转账」映射业务类型 INTERNAL_TRANSFER（不是收付方向）', () => {
    const filters: FundflowFilterState = {
      ...emptyFundflowFilters(),
      direction: 'TRANSFER',
    }
    expect(resolveTransactionQuery(filters, 1, 20)).toEqual({
      page: 1,
      size: 20,
      transactionType: 'INTERNAL_TRANSFER',
    })
  })

  it('方向「内部转账」与业务类型冲突时返回 null（结果确定为空）', () => {
    const filters: FundflowFilterState = {
      ...emptyFundflowFilters(),
      direction: 'TRANSFER',
      transactionType: 'SALARY',
    }
    expect(resolveTransactionQuery(filters, 1, 20)).toBeNull()
    expect(hasActiveFundflowFilters(filters)).toBe(true)
    expect(hasActiveFundflowFilters(emptyFundflowFilters())).toBe(false)
  })
})

describe('资金流水详情装配（来源单据 + 撤销信息）', () => {
  it('完整字段 + 来源单据 + 撤销时间占位', () => {
    const detail = buildTransactionDetailModel(txn, '现金账户')
    const keys = detail.rows.map((row) => row.key)
    expect(keys).toContain('sourceDoc')
    expect(keys).toContain('voidedAt')
    expect(keys).toContain('status')

    const byKey = Object.fromEntries(detail.rows.map((row) => [row.key, row]))
    expect(byKey.account?.value).toBe('现金账户')
    expect(byKey.amount?.value).toBe('1850.39')
    expect(byKey.amount?.kind).toBe('money')
    expect(byKey.status?.value).toBe('已入账')
    expect(byKey.voidedAt?.value).toBe('—')
    expect(detail.sourceDocText).toContain('股东出资单')
  })

  it('已作废流水展示撤销时间；null 字段显示占位符', () => {
    const voided: FundTransaction = {
      ...txn,
      status: 'VOIDED',
      voidedAt: '2026-11-26T09:00:00',
      counterparty: null,
      transferGroupId: null,
    }
    const detail = buildTransactionDetailModel(voided, null)
    const byKey = Object.fromEntries(detail.rows.map((row) => [row.key, row]))
    expect(byKey.voidedAt?.value).toBe('2026-11-26T09:00:00')
    expect(byKey.counterparty?.value).toBe('—')
    expect(byKey.transferGroupId?.value).toBe('—')
    // 账户名解析失败回退账户标识
    expect(byKey.account?.value).toBe('acct-1')
  })

  it('可撤销来源单据判定（业务单据可撤销；手工/已作废不可）', () => {
    expect(resolveVoidableSource(txn)).toEqual({
      sourceDocType: 'CONTRIBUTION',
      sourceDocId: 'c-1',
      label: '股东出资单',
    })
    expect(resolveVoidableSource({ ...txn, status: 'VOIDED' })).toBeNull()
    expect(resolveVoidableSource({ ...txn, sourceDocType: null, sourceDocId: null })).toBeNull()
    expect(resolveVoidableSource({ ...txn, sourceDocType: 'RECEIPT' })).toBeNull()
    expect(sourceDocText({ ...txn, sourceDocType: null, sourceDocId: null })).toBe('手工录入（无来源单据）')
    expect(buildTransactionDetailModel(txn, null).voidable?.sourceDocId).toBe('c-1')
  })
})
