/**
 * 应收 API：应收单 / 加工费回款 / 核销预览与自动分配 / 撤销（/api/v1/receivable/*）。
 *
 * 金额一律 DecimalString（十进制字符串）；写操作需携带幂等键（后端唯一约束兜底）。
 */

import { get, post } from './client'
import type {
  AllocationPreview,
  AllocationPreviewInput,
  BusinessErrorView,
  EntityId,
  LocalDate,
  PageResult,
  ReceiptCreateInput,
  ReceiptRecord,
  ReceivableBalance,
  ReceivableCreateInput,
  ReceivablePaymentStatus,
  ReceivableRecord,
} from './types'

/** 应收单列表查询参数 */
export interface ReceivableListQuery {
  page: number
  size: number
  keyword?: string
  dateFrom?: LocalDate
  dateTo?: LocalDate
  customerId?: EntityId
  accountingMonth?: string
  paymentStatus?: ReceivablePaymentStatus
  overdueOnly?: boolean
}

/** 回款单列表查询参数 */
export interface ReceiptListQuery {
  page: number
  size: number
  keyword?: string
  dateFrom?: LocalDate
  dateTo?: LocalDate
  customerId?: EntityId
  accountId?: EntityId
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

/* -------------------------------- 应收单 -------------------------------- */

export function listReceivables(query: ReceivableListQuery): Promise<PageResult<ReceivableRecord>> {
  return get<PageResult<ReceivableRecord>>('/receivable/receivables', toParams({ ...query }))
}

export function getReceivable(id: EntityId): Promise<ReceivableRecord> {
  return get<ReceivableRecord>(`/receivable/receivables/${id}`)
}

export function createReceivable(input: ReceivableCreateInput): Promise<ReceivableRecord> {
  return post<ReceivableRecord>('/receivable/receivables', input)
}

export function voidReceivable(id: EntityId, voidDate: LocalDate, reason?: string): Promise<void> {
  return post<void>(`/receivable/receivables/${id}/void`, { voidDate, reason })
}

/* -------------------------------- 收款单 -------------------------------- */

export function listReceipts(query: ReceiptListQuery): Promise<PageResult<ReceiptRecord>> {
  return get<PageResult<ReceiptRecord>>('/receivable/receipts', toParams({ ...query }))
}

export function getReceipt(id: EntityId): Promise<ReceiptRecord> {
  return get<ReceiptRecord>(`/receivable/receipts/${id}`)
}

export function createReceipt(input: ReceiptCreateInput): Promise<ReceiptRecord> {
  return post<ReceiptRecord>('/receivable/receipts', input)
}

export function previewReceiptAllocation(input: AllocationPreviewInput): Promise<AllocationPreview> {
  return post<AllocationPreview>('/receivable/receipts/preview', input)
}

export function autoAllocateReceipt(input: AllocationPreviewInput): Promise<AllocationPreview> {
  return post<AllocationPreview>('/receivable/receipts/auto-allocate', input)
}

/** 确认前校验（返回错误列表，空数组表示可确认） */
export function validateReceipt(input: ReceiptCreateInput): Promise<BusinessErrorView[]> {
  return post<BusinessErrorView[]>('/receivable/receipts/validate', input)
}

export function voidReceipt(id: EntityId, voidDate: LocalDate, reason?: string): Promise<void> {
  return post<void>(`/receivable/receipts/${id}/void`, { voidDate, reason })
}

/* -------------------------------- 余额统计 ------------------------------- */

export function fetchReceivableBalance(): Promise<ReceivableBalance> {
  return get<ReceivableBalance>('/receivable/summary')
}
