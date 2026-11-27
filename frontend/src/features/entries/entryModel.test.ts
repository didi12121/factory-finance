/**
 * 业务录入视图模型测试（纯函数）：表单校验、载荷装配。
 */
import { describe, expect, it } from 'vitest'

import {
  toContributionInput,
  toExpenseInput,
  toTransferInput,
  validateContributionForm,
  validateExpenseForm,
  validateTransferForm,
} from './entryModel'

describe('出资表单：股东/账户/金额/日期', () => {
  it('必填校验', () => {
    const errors = validateContributionForm({ shareholderId: '', accountId: '', amount: '', bizDate: '' })
    expect(errors.shareholderId).toBe('请选择股东')
    expect(errors.accountId).toBe('请选择入账账户')
    expect(errors.amount).toBe('请输入金额')
    expect(errors.bizDate).toBe('请选择业务日期')
  })

  it('合法表单无错误', () => {
    const errors = validateContributionForm({ shareholderId: '1', accountId: '1', amount: '50000', bizDate: '2026-11-27' })
    expect(errors).toEqual({})
  })

  it('载荷装配（金额归一化 + 数字 ID + 日期字段名）', () => {
    const input = toContributionInput({
      shareholderId: '1',
      accountId: '2',
      amount: '50,000.00',
      bizDate: '2026-11-27',
      remark: '测试出资',
    })
    expect(input.shareholderId).toBe(1)
    expect(input.accountId).toBe(2)
    expect(input.amount).toBe('50000.00')
    expect(input.contributionDate).toBe('2026-11-27')
    expect(input.remark).toBe('测试出资')
  })
})

describe('支出表单：分类/付款账户/金额/日期', () => {
  it('分类校验', () => {
    const errors = validateExpenseForm({ category: 'INVALID', accountId: '', amount: '100', bizDate: '2026-11-27' })
    expect(errors.category).toBe('请选择支出分类')
    expect(errors.accountId).toBe('请选择付款账户')
  })

  it('合法表单无错误', () => {
    const errors = validateExpenseForm({ category: 'SALARY', accountId: '1', amount: '100', bizDate: '2026-11-27' })
    expect(errors).toEqual({})
  })

  it('载荷装配（payDate + content + payee）', () => {
    const input = toExpenseInput({
      category: 'SALARY',
      content: '11月工资',
      accountId: '1',
      amount: '200',
      bizDate: '2026-11-27',
      counterparty: '张三',
      remark: '测试支出',
    })
    expect(input.category).toBe('SALARY')
    expect(input.content).toBe('11月工资')
    expect(input.accountId).toBe(1)
    expect(input.amount).toBe('200')
    expect(input.payDate).toBe('2026-11-27')
    expect(input.payee).toBe('张三')
    expect(input.remark).toBe('测试支出')
  })
})

describe('转账表单：转出/转入账户不得相同', () => {
  it('账户相同拒绝', () => {
    const errors = validateTransferForm({ fromAccountId: '1', toAccountId: '1', amount: '10', bizDate: '2026-11-27' })
    expect(errors.toAccountId).toBe('转出账户与转入账户不能相同')
  })

  it('合法转账', () => {
    const errors = validateTransferForm({ fromAccountId: '1', toAccountId: '2', amount: '10', bizDate: '2026-11-27' })
    expect(errors).toEqual({})
  })

  it('载荷装配（transferDate + 数字 ID）', () => {
    const input = toTransferInput({
      fromAccountId: '1',
      toAccountId: '2',
      amount: '1,000.00',
      bizDate: '2026-11-27',
      remark: '测试转账',
    })
    expect(input.fromAccountId).toBe(1)
    expect(input.toAccountId).toBe(2)
    expect(input.amount).toBe('1000.00')
    expect(input.transferDate).toBe('2026-11-27')
    expect(input.remark).toBe('测试转账')
  })
})
