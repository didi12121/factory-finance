import { describe, expect, it } from 'vitest'

import {
  accountOptions,
  shareholderOptions,
  toContributionInput,
  toExpenseInput,
  toTransferInput,
  validateBizDate,
  validateContributionForm,
  validateEntryAmount,
  validateExpenseForm,
  validateTransferForm,
} from './entryModel'
import type { FundAccount, Shareholder } from '@/services/api'

const TODAY = '2026-11-27'

describe('业务录入金额/日期装配校验', () => {
  it('金额：必填、DECIMAL(18,2) 格式、必须大于 0', () => {
    expect(validateEntryAmount('')).toBe('请输入金额')
    expect(validateEntryAmount('1.234')).toBe(
      '金额格式不正确：仅支持数字、合法千分位与最多两位小数（DECIMAL(18,2)）',
    )
    expect(validateEntryAmount('1e5')).toBe(
      '金额格式不正确：仅支持数字、合法千分位与最多两位小数（DECIMAL(18,2)）',
    )
    expect(validateEntryAmount('0')).toBe('金额必须大于 0')
    expect(validateEntryAmount('-100.00')).toBe('金额必须大于 0')
    expect(validateEntryAmount('1,850.39')).toBe('')
  })

  it('业务日期：必填、YYYY-MM-DD、不得晚于当前业务日期', () => {
    expect(validateBizDate('', TODAY)).toBe('请选择业务日期')
    expect(validateBizDate('2026-13-01', TODAY)).toBe('业务日期格式不正确（YYYY-MM-DD）')
    expect(validateBizDate('2025-02-29', TODAY)).toBe('业务日期格式不正确（YYYY-MM-DD）')
    expect(validateBizDate('2026-11-28', TODAY)).toBe('业务日期不得晚于当前业务日期')
    expect(validateBizDate('2026-11-27', TODAY)).toBe('')
    expect(validateBizDate('2024-02-29', TODAY)).toBe('')
  })
})

describe('出资/支出/转账表单校验与载荷装配', () => {
  it('出资表单：股东/账户/金额/日期', () => {
    expect(
      validateContributionForm({ shareholderId: '', accountId: '', amount: '', bizDate: '' }),
    ).toEqual({
      shareholderId: '请选择股东',
      accountId: '请选择入账账户',
      amount: '请输入金额',
      bizDate: '请选择业务日期',
    })
    expect(
      validateContributionForm({ shareholderId: 's-1', accountId: 'acct-1', amount: '50000', bizDate: '2026-11-27' }),
    ).toEqual({})

    const input = toContributionInput({
      shareholderId: 's-1',
      accountId: 'acct-1',
      amount: '50,000.00',
      bizDate: '2026-11-27',
      remark: '  出资款  ',
    })
    expect(input).toEqual({
      shareholderId: 's-1',
      accountId: 'acct-1',
      amount: '50000.00',
      bizDate: '2026-11-27',
      remark: '出资款',
    })
  })

  it('支出表单：分类/付款账户/金额/日期', () => {
    expect(
      validateExpenseForm({ category: 'INVALID', accountId: '', amount: '100', bizDate: '2026-11-27' }),
    ).toEqual({ category: '请选择支出分类', accountId: '请选择付款账户' })
    expect(
      validateExpenseForm({ category: 'SALARY', accountId: 'acct-1', amount: '100', bizDate: '2026-11-27' }),
    ).toEqual({})

    const input = toExpenseInput({
      category: 'UTILITIES',
      accountId: 'acct-1',
      amount: '200',
      bizDate: '2026-11-27',
      counterparty: '  电力公司  ',
      remark: '',
    })
    expect(input).toEqual({
      category: 'UTILITIES',
      accountId: 'acct-1',
      amount: '200',
      bizDate: '2026-11-27',
      counterparty: '电力公司',
      remark: null,
    })
  })

  it('转账表单：转出/转入账户不得相同', () => {
    expect(
      validateTransferForm({ fromAccountId: 'acct-1', toAccountId: 'acct-1', amount: '10', bizDate: '2026-11-27' }),
    ).toEqual({ toAccountId: '转出账户与转入账户不能相同' })
    expect(
      validateTransferForm({ fromAccountId: 'acct-1', toAccountId: 'acct-2', amount: '10', bizDate: '2026-11-27' }),
    ).toEqual({})

    const input = toTransferInput({
      fromAccountId: 'acct-1',
      toAccountId: 'acct-2',
      amount: '1,000.00',
      bizDate: '2026-11-27',
      remark: '',
    })
    expect(input).toEqual({
      fromAccountId: 'acct-1',
      toAccountId: 'acct-2',
      amount: '1000.00',
      bizDate: '2026-11-27',
      remark: null,
    })
  })
})

describe('下拉选项装配（停用不可选）', () => {
  const accounts: FundAccount[] = [
    {
      id: 'acct-1',
      accountNo: 'FA-0001',
      accountName: '现金账户',
      accountType: 'CASH',
      currency: 'CNY',
      openingBalance: '0',
      status: 'ENABLED',
      currentBalance: null,
      remark: null,
      createdAt: '2026-11-01T09:00:00',
    },
    {
      id: 'acct-2',
      accountNo: 'FA-0002',
      accountName: '旧账户',
      accountType: 'BANK',
      currency: 'CNY',
      openingBalance: '0',
      status: 'DISABLED',
      currentBalance: null,
      remark: null,
      createdAt: '2026-11-01T09:00:00',
    },
  ]

  const shareholders: Shareholder[] = [
    {
      id: 's-1',
      shareholderNo: 'GD-0001',
      name: '王五',
      contact: null,
      phone: null,
      status: 'DISABLED',
      remark: null,
      createdAt: '2026-11-01T09:00:00',
    },
  ]

  it('账户/股东下拉：停用项标记禁用', () => {
    expect(accountOptions(accounts)).toEqual([
      { label: '现金账户', value: 'acct-1', disabled: false },
      { label: '旧账户（已停用）', value: 'acct-2', disabled: true },
    ])
    expect(shareholderOptions(shareholders)).toEqual([
      { label: '王五（已停用）', value: 's-1', disabled: true },
    ])
  })
})
