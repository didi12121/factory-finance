/**
 * 业务录入视图模型（出资/支出/转账，纯函数）：表单校验与载荷装配。
 *
 * 红线：
 * - 金额为业务金额（DECIMAL(18,2)）且恒正：校验复用 utils/money（BigInt 定点比较），
 *   后端校验为最终防线；
 * - 业务日期不得晚于当前业务日期（前端提示性校验，后端拒绝为准）；
 * - 编号由后端生成；撤销保留原单据 + 反向流水，前端只发起 void 请求。
 */

import type {
  ContributionInput,
  ExpenseInput,
  ExpenseCategory,
  FundAccount,
  Shareholder,
  TransferInput,
} from '@/services/api'
import { compareAmounts } from '@/utils/decimal'
import { isValidAmount, normalizeAmount } from '@/utils/money'
import { isLocalDate, todayLocalDate } from '@/utils/localDate'

/** schema 表单值 */
export type EntryFormValues = Record<string, string>

/** 必填文本校验 */
export function requireText(value: string, label: string, max = 255): string {
  const text = value.trim()
  if (text === '') {
    return `请输入${label}`
  }
  if (text.length > max) {
    return `${label}长度不能超过 ${max}`
  }
  return ''
}

/**
 * 业务金额校验：必填、合法 DECIMAL(18,2)、大于 0（金额恒正，方向由业务类型表达）。
 */
export function validateEntryAmount(value: string): string {
  const text = value.trim()
  if (text === '') {
    return '请输入金额'
  }
  if (!isValidAmount(text)) {
    return '金额格式不正确：仅支持数字、合法千分位与最多两位小数（DECIMAL(18,2)）'
  }
  const normalized = normalizeAmount(text) ?? '0'
  if (compareAmounts(normalized, '0') <= 0) {
    return '金额必须大于 0'
  }
  return ''
}

/** 业务日期校验：必填、YYYY-MM-DD、不得晚于当前业务日期 */
export function validateBizDate(value: string, today: string = todayLocalDate()): string {
  const text = value.trim()
  if (text === '') {
    return '请选择业务日期'
  }
  if (!isLocalDate(text)) {
    return '业务日期格式不正确（YYYY-MM-DD）'
  }
  if (text > today) {
    return '业务日期不得晚于当前业务日期'
  }
  return ''
}

/* ------------------------------- 出资载荷 ------------------------------- */

export function validateContributionForm(values: EntryFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  const shareholderError = requireText(values.shareholderId ?? '', '股东', 64)
  if (shareholderError !== '') {
    errors.shareholderId = '请选择股东'
  }
  const accountError = requireText(values.accountId ?? '', '资金账户', 64)
  if (accountError !== '') {
    errors.accountId = '请选择入账账户'
  }
  const amountError = validateEntryAmount(values.amount ?? '')
  if (amountError !== '') {
    errors.amount = amountError
  }
  const dateError = validateBizDate(values.bizDate ?? '')
  if (dateError !== '') {
    errors.bizDate = dateError
  }
  return errors
}

export function toContributionInput(values: EntryFormValues): ContributionInput {
  return {
    shareholderId: Number(values.shareholderId ?? ''),
    accountId: Number(values.accountId ?? ''),
    amount: normalizeAmount(values.amount ?? '') ?? '0',
    contributionDate: (values.bizDate ?? '').trim(),
    remark: (values.remark ?? '').trim() === '' ? null : (values.remark ?? '').trim(),
  }
}

/* ------------------------------- 支出载荷 ------------------------------- */

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['SALARY', 'UTILITIES', 'PURCHASE', 'OTHER']

export function validateExpenseForm(values: EntryFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!EXPENSE_CATEGORIES.includes(values.category as ExpenseCategory)) {
    errors.category = '请选择支出分类'
  }
  if (requireText(values.accountId ?? '', '资金账户', 64) !== '') {
    errors.accountId = '请选择付款账户'
  }
  const amountError = validateEntryAmount(values.amount ?? '')
  if (amountError !== '') {
    errors.amount = amountError
  }
  const dateError = validateBizDate(values.bizDate ?? '')
  if (dateError !== '') {
    errors.bizDate = dateError
  }
  return errors
}

export function toExpenseInput(values: EntryFormValues): ExpenseInput {
  return {
    category: values.category as ExpenseCategory,
    content: (values.content ?? '').trim(),
    payDate: (values.bizDate ?? '').trim(),
    accountId: Number(values.accountId ?? ''),
    amount: normalizeAmount(values.amount ?? '') ?? '0',
    payee: (values.counterparty ?? '').trim() === '' ? null : (values.counterparty ?? '').trim(),
    remark: (values.remark ?? '').trim() === '' ? null : (values.remark ?? '').trim(),
  }
}

/* ------------------------------- 转账载荷 ------------------------------- */

export function validateTransferForm(values: EntryFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  const fromAccountId = values.fromAccountId ?? ''
  const toAccountId = values.toAccountId ?? ''
  if (requireText(fromAccountId, '转出账户', 64) !== '') {
    errors.fromAccountId = '请选择转出账户'
  }
  if (requireText(toAccountId, '转入账户', 64) !== '') {
    errors.toAccountId = '请选择转入账户'
  } else if (fromAccountId !== '' && fromAccountId === toAccountId) {
    errors.toAccountId = '转出账户与转入账户不能相同'
  }
  const amountError = validateEntryAmount(values.amount ?? '')
  if (amountError !== '') {
    errors.amount = amountError
  }
  const dateError = validateBizDate(values.bizDate ?? '')
  if (dateError !== '') {
    errors.bizDate = dateError
  }
  return errors
}

export function toTransferInput(values: EntryFormValues): TransferInput {
  return {
    transferDate: (values.bizDate ?? '').trim(),
    fromAccountId: Number(values.fromAccountId ?? ''),
    toAccountId: Number(values.toAccountId ?? ''),
    amount: normalizeAmount(values.amount ?? '') ?? '0',
    remark: (values.remark ?? '').trim() === '' ? null : (values.remark ?? '').trim(),
  }
}

/* ------------------------------ 字典装配 ------------------------------ */

/** 账户下拉选项（停用账户禁用：不可新增流水） */
export function accountOptions(accounts: FundAccount[]): { label: string; value: string; disabled?: boolean }[] {
  return accounts.map((account) => ({
    label: account.status === 'ENABLED' ? account.name : `${account.name}（已停用）`,
    value: account.id,
    disabled: account.status !== 'ENABLED',
  }))
}

/** 股东下拉选项（停用股东禁用：不可用于新单据） */
export function shareholderOptions(shareholders: Shareholder[]): { label: string; value: string; disabled?: boolean }[] {
  return shareholders.map((shareholder) => ({
    label: shareholder.status === 'ENABLED' ? shareholder.name : `${shareholder.name}（已停用）`,
    value: shareholder.id,
    disabled: shareholder.status !== 'ENABLED',
  }))
}
