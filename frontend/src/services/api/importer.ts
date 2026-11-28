/**
 * Excel 数据迁移 API（/api/v1/import）：模板下载、上传预览、确认导入、批次记录、导入核对。
 *
 * 金额一律十进制字符串；预览与导入结果中的行状态：
 * VALID / INVALID / DUPLICATE（预览）、SUCCESS / FAILED / DUPLICATE（批次明细）。
 */

import { apiClient, get, post } from './client'

/** 模板列定义 */
export interface ImportTemplateColumn {
  header: string
  required: boolean
  type: string
  example: string
}

/** 导入模板 */
export interface ImportTemplateInfo {
  code: string
  displayName: string
  columns: ImportTemplateColumn[]
}

/** 行状态 */
export type ImportRowStatus = 'VALID' | 'INVALID' | 'DUPLICATE' | 'PENDING' | 'SUCCESS' | 'FAILED'

/** 单行结果 */
export interface ImportRow {
  rowNo: number
  values: Record<string, string>
  status: ImportRowStatus
  messages: string[]
  bizDocType: string | null
  bizDocId: string | null
}

/** 导入前预览 */
export interface ImportPreview {
  templateCode: string
  displayName: string
  fileName: string
  fileSha256: string
  existingBatchNo: string | null
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  rows: ImportRow[]
}

/** 导入批次（含逐行结果） */
export interface ImportBatch {
  id: string
  batchNo: string
  templateCode: string
  fileName: string
  status: 'PARSED' | 'IMPORTED' | 'FAILED'
  totalRows: number
  successRows: number
  failedRows: number
  duplicateRows: number
  createdAt: string | null
  importedAt: string | null
  createdBy: string | null
  reused: boolean
  rows: ImportRow[]
}

/**
 * 恢复中断的导入批次：仅重跑未执行（PENDING）与失败（FAILED）行，
 * 已成功行不重复记账。
 */
export function resumeBatch(id: string): Promise<ImportBatch> {
  return post<ImportBatch>(`/import/batches/${id}/resume`, {})
}

/** 导入核对 */
export interface Reconciliation {
  asOf: string
  accounts: { accountNo: string; name: string; openingBalance: string; balance: string }[]
  totalFundBalance: string
  receivables: { customerId: string; customerName: string; outstanding: string; originalTotal: string }[]
  totalReceivableOutstanding: string
  payables: { supplierId: string; supplierName: string; outstanding: string }[]
  totalPayableOutstanding: string
  importStats: {
    batches: number
    successRows: number
    failedRows: number
    duplicateRows: number
    latestBatchNo: string | null
    latestBatchStatus: string | null
  }
  warnings: string[]
}

/** 模板清单 */
export function listTemplates(): Promise<ImportTemplateInfo[]> {
  return get<ImportTemplateInfo[]>('/import/templates')
}

/** 上传预览（不落库、不产生业务单据） */
export function previewImport(templateCode: string, file: File): Promise<ImportPreview> {
  const form = new FormData()
  form.append('templateCode', templateCode)
  form.append('file', file)
  return post<ImportPreview>('/import/preview', form)
}

/** 确认导入（同一文件重复确认返回既有批次） */
export function confirmImport(templateCode: string, file: File): Promise<ImportBatch> {
  const form = new FormData()
  form.append('templateCode', templateCode)
  form.append('file', file)
  return post<ImportBatch>('/import/confirm', form)
}

/** 批次记录 */
export function listBatches(limit = 20): Promise<ImportBatch[]> {
  return get<ImportBatch[]>('/import/batches', { limit })
}

/** 批次明细 */
export function getBatch(id: string): Promise<ImportBatch> {
  return get<ImportBatch>(`/import/batches/${id}`)
}


/** 导入核对 */
export function fetchReconciliation(): Promise<Reconciliation> {
  return get<Reconciliation>('/import/reconciliation')
}

/**
 * 下载模板（.xlsx）。需携带 Bearer 令牌，故以 blob 方式请求后触发本地下载。
 */
export async function downloadTemplate(code: string, fileName: string): Promise<void> {
  const response = await apiClient.get<Blob>(`/import/templates/${code}/file`, { responseType: 'blob' })
  const blob = response.data
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
