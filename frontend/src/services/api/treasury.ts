/**
 * 资金 API：出资 / 支出 / 转账 / 资金流水 / 经营概览（docs/API_CONTRACT.md 第 10 节）。
 *
 * - 业务单据 GET/POST + /{id}/void（撤销保留原单据 + 反向流水 + 防重复撤销）；
 * - 资金流水 GET（分页 + 搜索 + 日期/账户/类型/方向筛选）；
 * - 经营概览 GET /treasury/dashboard/summary?from&to。
 * 写操作幂等由后端唯一约束兜底（重复提交 409），前端不生成业务编号。
 */

import { get, post } from './client'
import type {
  ContributionInput,
  ContributionRecord,
  DashboardSummary,
  ExpenseInput,
  ExpenseRecord,
  FundTransaction,
  LocalDate,
  PageResult,
  RecordListQuery,
  TransactionQuery,
  TransferInput,
  TransferRecord,
} from './types'

/** 业务单据列表查询参数序列化（省略空筛选） */
export function recordQueryParams(query: RecordListQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { page: query.page, size: query.size }
  const keyword = query.keyword?.trim()
  if (keyword) {
    params.keyword = keyword
  }
  if (query.from) {
    params.from = query.from
  }
  if (query.to) {
    params.to = query.to
  }
  if (query.status) {
    params.status = query.status
  }
  return params
}

/** 资金流水查询参数序列化（省略空筛选） */
export function transactionQueryParams(query: TransactionQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { page: query.page, size: query.size }
  const keyword = query.keyword?.trim()
  if (keyword) {
    params.keyword = keyword
  }
  if (query.from) {
    params.from = query.from
  }
  if (query.to) {
    params.to = query.to
  }
  if (query.accountId) {
    params.accountId = query.accountId
  }
  if (query.transactionType) {
    params.transactionType = query.transactionType
  }
  if (query.direction) {
    params.direction = query.direction
  }
  return params
}

/* ------------------------------- 股东出资 ------------------------------ */

export function listContributions(query: RecordListQuery): Promise<PageResult<ContributionRecord>> {
  return get<PageResult<ContributionRecord>>('/treasury/contributions', recordQueryParams(query))
}

export function createContribution(input: ContributionInput): Promise<ContributionRecord> {
  return post<ContributionRecord>('/treasury/contributions', input)
}

export function voidContribution(id: string): Promise<ContributionRecord> {
  return post<ContributionRecord>(`/treasury/contributions/${id}/void`)
}

/* -------------------------------- 支出 -------------------------------- */

export function listExpenses(query: RecordListQuery): Promise<PageResult<ExpenseRecord>> {
  return get<PageResult<ExpenseRecord>>('/treasury/expenses', recordQueryParams(query))
}

export function createExpense(input: ExpenseInput): Promise<ExpenseRecord> {
  return post<ExpenseRecord>('/treasury/expenses', input)
}

export function voidExpense(id: string): Promise<ExpenseRecord> {
  return post<ExpenseRecord>(`/treasury/expenses/${id}/void`)
}

/* -------------------------------- 转账 -------------------------------- */

export function listTransfers(query: RecordListQuery): Promise<PageResult<TransferRecord>> {
  return get<PageResult<TransferRecord>>('/treasury/transfers', recordQueryParams(query))
}

export function createTransfer(input: TransferInput): Promise<TransferRecord> {
  return post<TransferRecord>('/treasury/transfers', input)
}

export function voidTransfer(id: string): Promise<TransferRecord> {
  return post<TransferRecord>(`/treasury/transfers/${id}/void`)
}

/* ------------------------------- 资金流水 ------------------------------ */

export function listFundTransactions(query: TransactionQuery): Promise<PageResult<FundTransaction>> {
  return get<PageResult<FundTransaction>>('/treasury/transactions', transactionQueryParams(query))
}

/* ------------------------------- 经营概览 ------------------------------ */

/**
 * 经营概览统计（?from&to 为统计期间，YYYY-MM-DD）。
 * 应收相关指标未开通：由页面标注「待开通」，禁止显假数字。
 */
export function fetchDashboardSummary(from: LocalDate, to: LocalDate): Promise<DashboardSummary> {
  return get<DashboardSummary>('/treasury/dashboard/summary', { from, to })
}
