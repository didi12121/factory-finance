/**
 * 跨页面导航路径构造（冻结契约优先）。
 */

import { describe, expect, it } from 'vitest'

import {
  RECEIVABLES_PATH,
  RECEIVABLES_ROUTE_PATH,
  TREASURY_TRANSACTIONS_ROUTE_PATH,
  buildNewRecordPath,
  buildProcessingFeeCreatePath,
  buildReceivableDetailPath,
  buildTransactionsPath,
} from '../navigation'

describe('导航路径构造', () => {
  it('应收余额 → 应收列表（冻结常量）', () => {
    expect(RECEIVABLES_PATH).toBe('/business/receivables')
    expect(RECEIVABLES_PATH).toBe(RECEIVABLES_ROUTE_PATH)
  })

  it('待收单据 → 应收详情 /business/receivables/:id', () => {
    expect(buildReceivableDetailPath('ar-001')).toBe('/business/receivables/ar-001')
  })

  it('近期流水 → 资金流水列表', () => {
    expect(buildTransactionsPath()).toBe('/treasury/transactions')
    expect(TREASURY_TRANSACTIONS_ROUTE_PATH).toBe('/treasury/transactions')
  })

  it('新建记录 → 冻结契约 buildProcessingFeeCreatePath（参数顺序 action → customerId → receivableId）', () => {
    expect(buildNewRecordPath()).toBe('/business/processing-fee?action=create')
    expect(buildProcessingFeeCreatePath()).toBe('/business/processing-fee?action=create')
    expect(buildProcessingFeeCreatePath({ customerId: 'c1', receivableId: 'r1' })).toBe(
      '/business/processing-fee?action=create&customerId=c1&receivableId=r1',
    )
  })
})
