/**
 * 资金账户页面视图模型（纯函数）：表单状态与校验、载荷装配。
 * 期初余额为业务金额（DECIMAL(18,2)），校验复用 utils/money；后端校验为最终防线。
 */

import type { FundAccount, FundAccountInput, FundAccountType } from '@/services/api'
import { isValidAmount, normalizeAmount } from '@/utils/money'

/** 账户表单值（schema 字段键 → 文本值） */
export type AccountFormValues = Record<string, string>

/** 账户表单字段键 */
export const ACCOUNT_FORM_KEYS = ['accountName', 'accountType', 'openingBalance', 'remark', 'status'] as const

export function emptyAccountForm(): AccountFormValues {
  return {
    accountName: '',
    accountType: 'CASH',
    openingBalance: '',
    remark: '',
    status: 'ENABLED',
  }
}

/** 由行数据装配编辑表单 */
export function accountFormFromRow(row: FundAccount): AccountFormValues {
  return {
    accountName: row.accountName,
    accountType: row.accountType,
    openingBalance: row.openingBalance,
    remark: row.remark ?? '',
    status: row.status,
  }
}

const ACCOUNT_TYPES: FundAccountType[] = ['CASH', 'BANK', 'WECHAT', 'ALIPAY', 'OTHER']

/**
 * 表单语义校验：账户名称必填（≤ 128）、账户类型合法、期初余额必填且为合法业务金额。
 * @returns 字段级错误（空对象即通过）
 */
export function validateAccountForm(values: AccountFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = values.accountName?.trim() ?? ''
  if (name === '') {
    errors.accountName = '请输入账户名称'
  } else if (name.length > 128) {
    errors.accountName = '账户名称长度不能超过 128'
  }
  if (!ACCOUNT_TYPES.includes(values.accountType as FundAccountType)) {
    errors.accountType = '请选择账户类型'
  }
  const openingBalance = values.openingBalance?.trim() ?? ''
  if (openingBalance === '') {
    errors.openingBalance = '请输入期初余额'
  } else if (!isValidAmount(openingBalance)) {
    errors.openingBalance = '金额格式不正确：仅支持数字、合法千分位与最多两位小数（DECIMAL(18,2)）'
  }
  return errors
}

/** 表单 → 账户载荷（编号后端生成） */
export function toAccountInput(values: AccountFormValues): FundAccountInput {
  return {
    accountName: (values.accountName ?? '').trim(),
    accountType: values.accountType as FundAccountType,
    openingBalance: normalizeAmount(values.openingBalance ?? '') ?? '0',
    remark: (values.remark ?? '').trim() === '' ? null : (values.remark ?? '').trim(),
    status: values.status === 'DISABLED' ? 'DISABLED' : 'ENABLED',
  }
}
