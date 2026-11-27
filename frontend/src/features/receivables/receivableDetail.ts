/**
 * 应收单详情组合（纯函数）—— Agent F（P02-F）。
 *
 * 职责：把 store 的收款单（Receipt）与核销明细（ReceiptAllocation）组合成
 * 详情页「回款记录」「核销明细」「操作历史」的展示行。
 *
 * 红线：
 * - **收款单实际总额（Receipt.actualAmount）≠ 本单核销金额（ReceiptAllocation.allocationAmount）**：
 *   一笔收款可能核销多张应收单，本单已收 = Σ 本单核销金额，禁止把收款单总额当作本单已收展示；
 * - 金额聚合走 sumAmounts（BigInt 定点），禁止 Number/parseFloat；
 * - 本模块不产生任何财务派生值，只做关联投影与精确求和。
 */

import { type DecimalString } from '@/utils/decimal'
import { sumAmounts } from '../prototype/domain/amounts'
import type { EntityId, IsoDateTime, LocalDate, Receipt, ReceiptAllocation } from '../prototype/contracts'

/** 详情页「回款记录」行（按收款单聚合，区分收款单实际总额 vs 本单核销金额） */
export interface ReceivableReceiptRow {
  receiptId: EntityId
  receiptNo: string
  receiptDate: LocalDate
  accountId: EntityId
  /** 收款单实际总额（该收款单的全部实际收款，可能核销多张应收单） */
  receiptActualAmount: DecimalString
  /** 本单核销金额（该收款单核销至本应收单的金额，Σ ≤ 收款单实际总额） */
  allocatedToThisReceivable: DecimalString
}

/** 详情页「核销明细」行（逐笔核销记录） */
export interface ReceivableAllocationRow {
  allocationId: EntityId
  receiptId: EntityId
  receiptNo: string
  allocationAmount: DecimalString
  allocatedAt: IsoDateTime
}

/** 详情页「操作历史」条目（创建 + 核销事件，按时间升序） */
export interface ReceivableAuditEntry {
  at: IsoDateTime
  /** 事件说明（业务中文） */
  event: string
}

function receiptNoOf(receipts: Receipt[], receiptId: EntityId): string {
  const found = receipts.find((item) => item.id === receiptId)
  return found === undefined ? receiptId : found.receiptNo
}

/**
 * 回款记录行：本应收单的每笔核销关联回收款单，按收款单聚合输出
 * 「收款单实际总额」与「本单核销金额」两个独立金额（禁止混用）。
 * 排序：核销时间升序 → 收款单编号升序。
 */
export function buildReceivableReceiptRows(
  receivableId: EntityId,
  allocations: ReceiptAllocation[],
  receipts: Receipt[],
): ReceivableReceiptRow[] {
  const own = allocations.filter((item) => item.receivableId === receivableId)
  const byReceipt = new Map<EntityId, ReceiptAllocation[]>()
  for (const allocation of own) {
    const list = byReceipt.get(allocation.receiptId) ?? []
    list.push(allocation)
    byReceipt.set(allocation.receiptId, list)
  }
  const rows: ReceivableReceiptRow[] = []
  for (const [receiptId, items] of byReceipt) {
    const receipt = receipts.find((item) => item.id === receiptId)
    rows.push({
      receiptId,
      receiptNo: receiptNoOf(receipts, receiptId),
      receiptDate: receipt?.receiptDate ?? '',
      accountId: receipt?.accountId ?? '',
      receiptActualAmount: receipt?.actualAmount ?? '0.00',
      allocatedToThisReceivable: sumAmounts(items.map((item) => item.allocationAmount)),
    })
  }
  return rows.sort((a, b) => {
    const aFirst = own.find((item) => item.receiptId === a.receiptId)
    const bFirst = own.find((item) => item.receiptId === b.receiptId)
    const aAt = aFirst?.allocatedAt ?? ''
    const bAt = bFirst?.allocatedAt ?? ''
    if (aAt !== bAt) {
      return aAt < bAt ? -1 : 1
    }
    return a.receiptNo < b.receiptNo ? -1 : a.receiptNo > b.receiptNo ? 1 : 0
  })
}

/** 核销明细行（逐笔，核销时间升序 → 明细 ID 升序） */
export function buildReceivableAllocationRows(
  receivableId: EntityId,
  allocations: ReceiptAllocation[],
  receipts: Receipt[],
): ReceivableAllocationRow[] {
  return allocations
    .filter((item) => item.receivableId === receivableId)
    .slice()
    .sort((a, b) => {
      if (a.allocatedAt !== b.allocatedAt) {
        return a.allocatedAt < b.allocatedAt ? -1 : 1
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .map((item) => ({
      allocationId: item.id,
      receiptId: item.receiptId,
      receiptNo: receiptNoOf(receipts, item.receiptId),
      allocationAmount: item.allocationAmount,
      allocatedAt: item.allocatedAt,
    }))
}

/**
 * 操作历史：创建事件（createdAt）+ 逐笔核销事件（allocatedAt），按时间升序。
 * 仅组合既有审计字段，不虚构操作记录。
 */
export function buildReceivableAuditEntries(
  input: { createdAt: IsoDateTime },
  receivableId: EntityId,
  allocations: ReceiptAllocation[],
  receipts: Receipt[],
): ReceivableAuditEntry[] {
  const entries: ReceivableAuditEntry[] = [{ at: input.createdAt, event: '创建应收单' }]
  for (const row of buildReceivableAllocationRows(receivableId, allocations, receipts)) {
    entries.push({
      at: row.allocatedAt,
      event: `核销 ${row.allocationAmount}（收款单 ${row.receiptNo}）`,
    })
  }
  return entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}
