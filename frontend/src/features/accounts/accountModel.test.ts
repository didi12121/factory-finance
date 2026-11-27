import { describe, expect, it } from 'vitest'

import {
  accountFormFromRow,
  emptyAccountForm,
  toAccountInput,
  validateAccountForm,
} from './accountModel'
import type { FundAccount } from '@/services/api'

const account: FundAccount = {
  id: 'acct-1',
  accountNo: 'FA-0001',
  accountName: '现金账户',
  accountType: 'CASH',
  currency: 'CNY',
  openingBalance: '1000.50',
  status: 'ENABLED',
  currentBalance: '1850.39',
  remark: null,
  createdAt: '2026-11-01T09:00:00',
}

describe('资金账户表单校验与载荷装配', () => {
  it('账户名称/类型/期初余额校验', () => {
    expect(validateAccountForm({ ...emptyAccountForm(), accountName: '' })).toEqual({
      accountName: '请输入账户名称',
      openingBalance: '请输入期初余额',
    })
    expect(validateAccountForm({ ...emptyAccountForm(), accountName: '银行', accountType: '' })).toEqual({
      accountType: '请选择账户类型',
      openingBalance: '请输入期初余额',
    })
    expect(
      validateAccountForm({ accountName: '银行', accountType: 'BANK', openingBalance: '1,000.00', remark: '', status: 'ENABLED' }),
    ).toEqual({})
    expect(
      validateAccountForm({ accountName: '银行', accountType: 'BANK', openingBalance: '1e5', remark: '', status: 'ENABLED' }),
    ).toEqual({ openingBalance: '金额格式不正确：仅支持数字、合法千分位与最多两位小数（DECIMAL(18,2)）' })
  })

  it('载荷装配：千分位归一化为规范十进制字符串，编号不输出', () => {
    const input = toAccountInput({
      accountName: '  银行账户  ',
      accountType: 'BANK',
      openingBalance: '1,234.50',
      remark: '',
      status: 'DISABLED',
    })
    expect(input).toEqual({
      accountName: '银行账户',
      accountType: 'BANK',
      openingBalance: '1234.50',
      remark: null,
      status: 'DISABLED',
    })
    expect('accountNo' in input).toBe(false)
  })

  it('行 → 表单回填', () => {
    expect(accountFormFromRow(account)).toEqual({
      accountName: '现金账户',
      accountType: 'CASH',
      openingBalance: '1000.50',
      remark: '',
      status: 'ENABLED',
    })
  })
})
