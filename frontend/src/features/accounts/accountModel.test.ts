/**
 * 资金账户页面视图模型测试（纯函数）。
 */
import { describe, expect, it } from 'vitest'

import { accountFormFromRow, emptyAccountForm, toAccountInput, validateAccountForm } from './accountModel'

describe('账户表单校验', () => {
  it('必填校验', () => {
    const errors = validateAccountForm({ ...emptyAccountForm(), accountName: '', openingBalance: '' })
    expect(errors.accountName).toBe('请输入账户名称')
    expect(errors.openingBalance).toBe('请输入期初余额')
  })

  it('账户类型必填', () => {
    const errors = validateAccountForm({ ...emptyAccountForm(), accountName: '银行', accountType: '' })
    expect(errors.accountType).toBe('请选择账户类型')
  })

  it('金额格式校验', () => {
    expect(
      validateAccountForm({ accountName: '银行', accountType: 'BANK', openingBalance: '1,000.00', openingDate: '2026-11-27', remark: '', status: 'ENABLED' }),
    ).toEqual({})
    expect(
      validateAccountForm({ accountName: '银行', accountType: 'BANK', openingBalance: '1e5', openingDate: '2026-11-27', remark: '', status: 'ENABLED' }),
    ).toEqual({ openingBalance: '金额格式不正确：仅支持数字、合法千分位与最多两位小数（DECIMAL(18,2)）' })
  })
})

describe('表单 → 账户载荷', () => {
  it('名称去除首尾空白', () => {
    const input = toAccountInput({
      accountName: '  银行账户  ',
      accountType: 'BANK',
      openingBalance: '1,234.50',
      openingDate: '2026-11-27',
      remark: '',
      status: 'ENABLED',
    })
    expect(input.name).toBe('银行账户')
    expect(input.openingBalance).toBe('1234.50')
    expect(input.openingDate).toBe('2026-11-27')
    expect(input.remark).toBeNull()
  })

  it('行数据装配编辑表单', () => {
    const form = accountFormFromRow({
      id: '1',
      accountNo: 'FA-0001',
      name: '现金账户',
      accountType: 'CASH',
      currency: 'CNY',
      openingDate: '2026-11-27',
      openingBalance: '1000.50',
      status: 'ENABLED',
      currentBalance: '1000.50',
      remark: null,
      createdAt: '2026-11-27T10:00:00',
    })
    expect(form.accountName).toBe('现金账户')
    expect(form.openingBalance).toBe('1000.50')
  })
})
