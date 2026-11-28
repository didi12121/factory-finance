/**
 * 应付 API：应付单 / 付款 / 核销预览 / 撤销（/api/v1/payable/*）。
 */

import { get, post } from './client'
import type {
  EntityId,
  LocalDate,
  PayableAllocationInput,
  PayableAllocationPreview,
  PayableBalance,
  PayableCreateInput,
  PayablePaymentStatus,
  PayableRecord,
  FundableExpense,
  PageResult,
  PaymentCreateInput,
  PaymentRecord,
} from './types'

/** 应付单列表查询参数 */
export interface PayableListQuery {
  page: number
  size: number
  keyword?: string
  dateFrom?: LocalDate
  dateTo?: LocalDate
  supplierId?: EntityId
  accountingMonth?: string
  paymentStatus?: PayablePaymentStatus
}

/** 付款单列表查询参数 */
export interface PaymentListQuery {
  page: number
  size: number
  keyword?: string
  dateFrom?: LocalDate
  dateTo?: LocalDate
  supplierId?: EntityId
  accountId?: EntityId
}

/** 付款核销预览载荷 */
export interface PayablePreviewInput {
  supplierId: number
  amount: string
  allocations?: PayableAllocationInput[]
}

function toParams(query: Record<string, string | number | boolean | undefined>): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    params[key] = value
  }
  return params
}

/* -------------------------------- 应付单 -------------------------------- */

export function listPayables(query: PayableListQuery): Promise<PageResult<PayableRecord>> {
  return get<PageResult<PayableRecord>>('/payable/payables', toParams({ ...query }))
}

export function getPayable(id: EntityId): Promise<PayableRecord> {
  return get<PayableRecord>(`/payable/payables/${id}`)
}

/** 可关联的已支付采购支出（排除已被有效应付单引用者） */
export function listFundableExpenses(): Promise<FundableExpense[]> {
  return get<FundableExpense[]>('/payable/payables/fundable-expenses')
}

export function createPayable(input: PayableCreateInput): Promise<PayableRecord> {
  return post<PayableRecord>('/payable/payables', input)
}

export function voidPayable(id: EntityId, voidDate: LocalDate, reason?: string): Promise<void> {
  return post<void>(`/payable/payables/${id}/void`, { voidDate, reason })
}

/* -------------------------------- 付款单 -------------------------------- */

export function listPayments(query: PaymentListQuery): Promise<PageResult<PaymentRecord>> {
  return get<PageResult<PaymentRecord>>('/payable/payments', toParams({ ...query }))
}

export function getPayment(id: EntityId): Promise<PaymentRecord> {
  return get<PaymentRecord>(`/payable/payments/${id}`)
}

export function createPayment(input: PaymentCreateInput): Promise<PaymentRecord> {
  return post<PaymentRecord>('/payable/payments', input)
}

export function previewPaymentAllocation(input: PayablePreviewInput): Promise<PayableAllocationPreview> {
  return post<PayableAllocationPreview>('/payable/payments/preview', input)
}

export function voidPayment(id: EntityId, voidDate: LocalDate, reason?: string): Promise<void> {
  return post<void>(`/payable/payments/${id}/void`, { voidDate, reason })
}

/* -------------------------------- 余额统计 ------------------------------- */

export function fetchPayableBalance(): Promise<PayableBalance> {
  return get<PayableBalance>('/payable/summary')
}
