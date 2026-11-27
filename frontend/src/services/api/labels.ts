/**
 * Phase 1 业务 API 枚举展示标签（真实业务单一来源）。
 *
 * 仅用于展示层；后端校验为最终防线。未知枚举值一律回退显示原值（禁止静默丢信息）。
 * 注意：本模块随生产构建进入产物，文案不得包含演示/虚构特征词。
 */

import type {
  EnableStatus,
  ExpenseCategory,
  FundAccountType,
  FundTransaction,
  RecordStatus,
  SourceDocType,
  TransactionDirection,
  TransactionType,
} from './types'

/** 启用状态标签 */
export const ENABLE_STATUS_LABELS: Record<EnableStatus, string> = {
  ENABLED: '启用',
  DISABLED: '停用',
}

/** 启用状态语义色（FinancialStatus kind） */
export const ENABLE_STATUS_KINDS: Record<EnableStatus, 'success' | 'muted'> = {
  ENABLED: 'success',
  DISABLED: 'muted',
}

/** 资金账户类型标签 */
export const FUND_ACCOUNT_TYPE_LABELS: Record<FundAccountType, string> = {
  CASH: '现金',
  BANK: '银行',
  WECHAT: '微信',
  ALIPAY: '支付宝',
  OTHER: '其他',
}

/** 业务交易类型标签（业务性质 ≠ 会计收入概念） */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  PROCESSING_FEE_RECEIPT: '加工费回款',
  SHAREHOLDER_CONTRIBUTION: '股东出资',
  SALARY: '工资支出',
  UTILITIES: '水电支出',
  PURCHASE: '采购支出',
  INTERNAL_TRANSFER: '内部转账',
  OTHER: '其他',
}

/** 支出分类标签 */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SALARY: '工资支出',
  UTILITIES: '水电支出',
  PURCHASE: '采购支出',
  OTHER: '其他',
}

/** 业务单据状态标签 */
export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  CONFIRMED: '已确认',
  VOIDED: '已撤销',
}

/** 业务单据状态语义色 */
export const RECORD_STATUS_KINDS: Record<RecordStatus, 'success' | 'muted'> = {
  CONFIRMED: 'success',
  VOIDED: 'muted',
}

/** 资金流水状态标签 */
export const TRANSACTION_STATUS_LABELS: Record<FundTransaction['status'], string> = {
  RECORDED: '已入账',
  VOIDED: '已作废',
}

/** 资金流水状态语义色 */
export const TRANSACTION_STATUS_KINDS: Record<FundTransaction['status'], 'success' | 'muted'> = {
  RECORDED: 'success',
  VOIDED: 'muted',
}

/** 来源单据类型标签（回溯链） */
export const SOURCE_DOC_TYPE_LABELS: Record<SourceDocType, string> = {
  CONTRIBUTION: '股东出资单',
  EXPENSE: '支出单',
  TRANSFER: '转账单',
  RECEIPT: '回款单据',
  PAYROLL: '工资单',
  PURCHASE: '采购单',
  OTHER: '其他单据',
}

/** 收付方向标签（方向二选一，金额恒正） */
export function directionLabel(direction: TransactionDirection): string {
  return direction === 'IN' ? '流入（IN）' : '流出（OUT）'
}

/** 业务类型标签解析（未知值回退原值） */
export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type as TransactionType] ?? type
}

/** 支出分类标签解析（未知值回退原值） */
export function expenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category
}

/** 来源单据类型标签解析（未知值回退原值） */
export function sourceDocTypeLabel(type: string): string {
  return SOURCE_DOC_TYPE_LABELS[type as SourceDocType] ?? type
}
