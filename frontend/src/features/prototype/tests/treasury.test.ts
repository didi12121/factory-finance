/**
 * 资金账户规则测试：余额重算（含 VOIDED 排除）、内部转账成对流水与净变化为零。
 */

import { describe, expect, it } from 'vitest'
import type { FundAccount, FundTransaction } from '../contracts'
import { DEMO_FUND_ACCOUNTS, DEMO_FUND_TRANSACTIONS, createInitialPrototypeState } from '../data/fixtures'
import {
  buildInternalTransferPair,
  netCashChange,
  recomputeAccountBalance,
} from '../domain/treasury'

function makeTransaction(overrides: Partial<FundTransaction> = {}): FundTransaction {
  return {
    id: 'txn-t1',
    transactionNo: 'FT-T-0001',
    transactionType: 'OTHER',
    tradeDate: '2026-11-30',
    accountId: 'acct-1',
    direction: 'IN',
    amount: '100.00',
    counterparty: null,
    sourceDocType: null,
    sourceDocId: null,
    transferGroupId: null,
    status: 'RECORDED',
    remark: null,
    createdAt: '2026-11-30T09:00:00',
    ...overrides,
  }
}

describe('recomputeAccountBalance', () => {
  it('账户余额重算：期初 + 有效 IN − 有效 OUT（演示数据手算值）', () => {
    const state = createInitialPrototypeState()
    const balances = state.fundAccounts.map((account) => ({
      id: account.id,
      balance: recomputeAccountBalance(account, state.fundTransactions),
    }))
    expect(balances).toEqual([
      { id: 'acct-bank', balance: '31545.16' },
      { id: 'acct-cash', balance: '29915.79' },
      { id: 'acct-wechat', balance: '15200.50' },
      { id: 'acct-alipay', balance: '1000.00' },
    ])
  })

  it('VOIDED 流水不参与余额重算；停用账户余额仍可重算', () => {
    const account: FundAccount = {
      id: 'acct-1',
      name: '测试账户',
      accountType: 'CASH',
      openingBalance: '100.00',
      enabled: false,
    }
    const transactions = [
      makeTransaction({ id: 'a', direction: 'IN', amount: '50.00' }),
      makeTransaction({ id: 'b', direction: 'OUT', amount: '20.00' }),
      makeTransaction({ id: 'c', direction: 'OUT', amount: '999.00', status: 'VOIDED' }),
      makeTransaction({ id: 'd', accountId: 'acct-other', direction: 'IN', amount: '777.00' }),
    ]
    expect(recomputeAccountBalance(account, transactions)).toBe('130.00')
  })

  it('0.01 级精确重算：1850.39 期初 + 0.01 − 1800.38 = 50.02', () => {
    const account: FundAccount = {
      id: 'acct-2',
      name: '测试账户 2',
      accountType: 'BANK',
      openingBalance: '1850.39',
      enabled: true,
    }
    const transactions = [
      makeTransaction({ id: 'a', accountId: 'acct-2', direction: 'IN', amount: '0.01' }),
      makeTransaction({ id: 'b', accountId: 'acct-2', direction: 'OUT', amount: '1800.38' }),
    ]
    expect(recomputeAccountBalance(account, transactions)).toBe('50.02')
  })
})

describe('内部转账', () => {
  it('成对流水：OUT+IN 同额、同 transferGroupId、方向相反，整体净变化为 0', () => {
    const [out, into] = buildInternalTransferPair({
      transferGroupId: 'tg-test',
      fromAccountId: 'acct-bank',
      toAccountId: 'acct-cash',
      amount: '10000.00',
      tradeDate: '2026-11-20',
      outTransactionNo: 'FT-T-9001',
      inTransactionNo: 'FT-T-9002',
      outId: 'txn-out',
      inId: 'txn-in',
      createdAt: '2026-11-20T11:00:00',
      outCounterparty: '示例现金账户',
      inCounterparty: '示例银行账户',
      remark: '内部转账测试',
    })
    expect(out.direction).toBe('OUT')
    expect(into.direction).toBe('IN')
    expect(out.amount).toBe('10000.00')
    expect(into.amount).toBe('10000.00')
    expect(out.transferGroupId).toBe('tg-test')
    expect(into.transferGroupId).toBe('tg-test')
    expect(netCashChange([out, into])).toBe('0.00')

    // 账户维度：转出 -10,000.00、转入 +10,000.00，整体资金不变
    const fromAccount: FundAccount = {
      id: 'acct-bank', name: '银行', accountType: 'BANK', openingBalance: '30000.00', enabled: true,
    }
    const toAccount: FundAccount = {
      id: 'acct-cash', name: '现金', accountType: 'CASH', openingBalance: '5000.00', enabled: true,
    }
    const pair = [out, into]
    expect(recomputeAccountBalance(fromAccount, pair)).toBe('20000.00')
    expect(recomputeAccountBalance(toAccount, pair)).toBe('15000.00')
  })

  it('演示数据中的两组内部转账整体净变化为零', () => {
    for (const groupId of ['tg-001', 'tg-002']) {
      const pair = DEMO_FUND_TRANSACTIONS.filter((item) => item.transferGroupId === groupId)
      expect(pair.length).toBe(2)
      expect(netCashChange(pair)).toBe('0.00')
    }
  })

  it('非法转账参数抛错（金额非法 / 同账户 / 日期非法）', () => {
    const base = {
      transferGroupId: 'tg-x',
      fromAccountId: 'a1',
      toAccountId: 'a2',
      amount: '10.00',
      tradeDate: '2026-11-30',
      outTransactionNo: 'FT-X-1',
      inTransactionNo: 'FT-X-2',
      outId: 'x1',
      inId: 'x2',
      createdAt: '2026-11-30T09:00:00',
      outCounterparty: null,
      inCounterparty: null,
      remark: null,
    }
    expect(() => buildInternalTransferPair({ ...base, amount: 'abc' })).toThrow()
    expect(() => buildInternalTransferPair({ ...base, amount: '-1.00' })).toThrow()
    expect(() => buildInternalTransferPair({ ...base, toAccountId: 'a1' })).toThrow()
    expect(() => buildInternalTransferPair({ ...base, tradeDate: '2026-13-01' })).toThrow()
  })
})

describe('演示数据账户期初与流水规模', () => {
  it('4 个账户（银行/现金/微信/支付宝停用）、22 条流水（含 1 条 VOIDED）', () => {
    expect(DEMO_FUND_ACCOUNTS.length).toBe(4)
    expect(DEMO_FUND_TRANSACTIONS.length).toBe(22)
    expect(DEMO_FUND_TRANSACTIONS.filter((item) => item.status === 'VOIDED').length).toBe(1)
    const types = new Set(DEMO_FUND_TRANSACTIONS.map((item) => item.transactionType))
    expect(types).toEqual(
      new Set([
        'PROCESSING_FEE_RECEIPT',
        'SHAREHOLDER_CONTRIBUTION',
        'SALARY',
        'UTILITIES',
        'PURCHASE',
        'INTERNAL_TRANSFER',
        'OTHER',
      ]),
    )
  })
})
