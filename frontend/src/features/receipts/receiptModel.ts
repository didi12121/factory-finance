/**
 * 加工费回款页面纯逻辑（无副作用，可独立测试）：
 * 跨页路由参数解析（契约 navigation.ts）、收款单行视图派生、核销草稿与命令构建。
 *
 * 红线：
 * - 金额一律 DecimalString，运算/比较走 utils/decimal.ts（BigInt 定点）与 domain/amounts.ts，
 *   禁止 Number / parseFloat 参与财务计算；
 * - 汇总与派生一律复用 domain 纯函数（sumAmounts / canonicalAmount2 / compareReceivableUrgency），
 *   不重复实现财务口径；
 * - 路由参数必须验证归属与有效性后才预填（无效参数安全处理，不误核销）。
 */

import type { LocationQuery } from 'vue-router'

import { compareAmounts, subtractAmounts, type DecimalString } from '@/utils/decimal'
import { normalizeAmount } from '@/utils/money'
import type {
  ConfirmReceiptCommand,
  Customer,
  EntityId,
  FundAccount,
  LocalDate,
  PreviewReceiptAllocationCommand,
  Receipt,
  ReceiptAllocation,
  ReceiptAllocationDraft,
  ReceivableView,
} from '@/features/prototype/contracts'
import { canonicalAmount2, sumAmounts } from '@/features/prototype/domain/amounts'
import { compareReceivableUrgency } from '@/features/prototype/domain/receivable'

/* --------------------------- 跨页路由参数解析 --------------------------- */

/** 回款流程入口路由参数的解析结果（预填值均已验证存在、启用、归属一致） */
export interface ProcessingFeeRoutePrefill {
  /** action=create 时自动展开登记表单 */
  openRegistration: boolean
  /** 预填客户（已验证存在且启用） */
  prefillCustomerId: EntityId | null
  /** 预填定位的应收单（已验证存在、归属该客户、未结清） */
  prefillReceivableId: EntityId | null
  /** 无效参数提示（面向用户；空数组表示参数全部有效或未携带） */
  notices: string[]
}

/** 路由参数解析上下文（来自 usePrototypeStore 的只读切片） */
export interface RouteParseContext {
  customers: Customer[]
  receivables: ReceivableView[]
}

function firstParam(query: LocationQuery, key: string): string | null {
  const raw = query[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === undefined || value === null || value === '' ? null : value
}

/**
 * 解析 `/business/processing-fee?action=create[&customerId=...][&receivableId=...]`。
 *
 * 规则（无效参数安全处理，绝不产生错误预填）：
 * - action 缺失或非 create：不展开登记表单；携带了 customerId/receivableId 时给出提示并忽略；
 * - customerId：必须存在且启用，否则忽略预填并提示；
 * - receivableId：必须存在、未结清、且与最终预填客户归属一致，否则忽略预填并提示；
 * - 仅携带 receivableId（customerId 缺省，契约允许）：按应收单归属推断客户；
 * - customerId 参数无效时不做跨参数推断，应收单一并忽略（不误核销）。
 */
export function parseProcessingFeeRouteQuery(
  query: LocationQuery,
  context: RouteParseContext,
): ProcessingFeeRoutePrefill {
  const notices: string[] = []
  const action = firstParam(query, 'action')
  const customerId = firstParam(query, 'customerId')
  const receivableId = firstParam(query, 'receivableId')

  if (action !== 'create') {
    if (customerId !== null || receivableId !== null) {
      notices.push('路由参数无效：action 仅支持 create，已忽略 customerId / receivableId 预填')
    }
    return { openRegistration: false, prefillCustomerId: null, prefillReceivableId: null, notices }
  }

  let prefillCustomerId: EntityId | null = null
  const customer = customerId === null ? null : (context.customers.find((item) => item.id === customerId) ?? null)
  if (customerId !== null) {
    if (customer === null) {
      notices.push(`路由参数无效：客户不存在（${customerId}），已忽略预填`)
    } else if (customer.status !== 'ENABLED') {
      notices.push(`路由参数无效：客户已停用（${customer.name}），已忽略预填`)
    } else {
      prefillCustomerId = customerId
    }
  }

  let prefillReceivableId: EntityId | null = null
  if (receivableId !== null) {
    const view = context.receivables.find((item) => item.receivable.id === receivableId) ?? null
    if (view === null) {
      notices.push(`路由参数无效：应收单不存在（${receivableId}），已忽略预填`)
    } else if (customerId !== null && prefillCustomerId === null) {
      // 客户参数无效：不做跨参数推断，应收单预填一并忽略（不误核销）
      notices.push(`路由参数无效：应收单 ${view.receivable.statementNo} 的预填已忽略`)
    } else {
      const owner = context.customers.find((item) => item.id === view.receivable.customerId) ?? null
      if (prefillCustomerId !== null && view.receivable.customerId !== prefillCustomerId) {
        notices.push(`路由参数无效：应收单 ${view.receivable.statementNo} 不属于所选客户，已忽略预填`)
      } else if (owner === null || owner.status !== 'ENABLED') {
        notices.push('路由参数无效：应收单归属客户不可用，已忽略预填')
      } else {
        if (prefillCustomerId === null) {
          prefillCustomerId = owner.id
        }
        if (compareAmounts(view.summary.outstandingAmount, '0') <= 0) {
          notices.push(`应收单 ${view.receivable.statementNo} 已结清，不可核销，已忽略预填`)
        } else {
          prefillReceivableId = receivableId
        }
      }
    }
  }

  return { openRegistration: true, prefillCustomerId, prefillReceivableId, notices }
}

/* --------------------------- 收款单列表行视图 --------------------------- */

/** 收款单核销状态（由核销明细派生，禁止冗余存储） */
export type ReceiptAllocationStatus = 'UNALLOCATED' | 'PARTIAL' | 'FULL'

/** 收款单列表行视图（实体 + 派生列 + 展示名称） */
export interface ReceiptRowView {
  receipt: Receipt
  customerName: string
  accountName: string
  /** 已核销金额 = Σ 该收款单核销明细（domain sumAmounts 精确累加） */
  allocatedAmount: DecimalString
  /** 未分配金额 = 实际收款 − 已核销（恒 ≥ 0） */
  unallocatedAmount: DecimalString
  allocationStatus: ReceiptAllocationStatus
  statusLabel: string
  statusKind: 'muted' | 'warning' | 'success'
}

function deriveAllocationStatus(allocated: DecimalString, actual: DecimalString): ReceiptAllocationStatus {
  if (compareAmounts(allocated, '0') <= 0) {
    return 'UNALLOCATED'
  }
  return compareAmounts(allocated, actual) >= 0 ? 'FULL' : 'PARTIAL'
}

function statusPresentation(status: ReceiptAllocationStatus): { statusLabel: string; statusKind: ReceiptRowView['statusKind'] } {
  switch (status) {
    case 'FULL':
      return { statusLabel: '已全额核销', statusKind: 'success' }
    case 'PARTIAL':
      return { statusLabel: '部分核销', statusKind: 'warning' }
    default:
      return { statusLabel: '未核销', statusKind: 'muted' }
  }
}

/** 派生收款单行视图（已核销/未分配/核销状态由核销明细实时派生） */
export function buildReceiptRowViews(
  receipts: Receipt[],
  allocations: ReceiptAllocation[],
  customers: Customer[],
  accounts: FundAccount[],
): ReceiptRowView[] {
  return receipts.map((receipt) => {
    const allocatedAmount = sumAmounts(
      allocations.filter((item) => item.receiptId === receipt.id).map((item) => item.allocationAmount),
    )
    const rawUnallocated = subtractAmounts(receipt.actualAmount, allocatedAmount)
    const unallocatedAmount =
      compareAmounts(rawUnallocated, '0') < 0 ? '0.00' : canonicalAmount2(rawUnallocated)
    const allocationStatus = deriveAllocationStatus(allocatedAmount, receipt.actualAmount)
    const { statusLabel, statusKind } = statusPresentation(allocationStatus)
    return {
      receipt,
      customerName: customers.find((item) => item.id === receipt.customerId)?.name ?? '—',
      accountName: accounts.find((item) => item.id === receipt.accountId)?.name ?? '—',
      allocatedAmount,
      unallocatedAmount,
      allocationStatus,
      statusLabel,
      statusKind,
    }
  })
}

/* --------------------------- 核销分配表行视图 --------------------------- */

/** 核销分配表行（未结清应收单 + 已收/当前未收派生值） */
export interface AllocationRowView {
  receivableId: EntityId
  statementNo: string
  accountingMonth: string
  dueDate: LocalDate | null
  originalAmount: DecimalString
  paidAmount: DecimalString
  outstandingAmount: DecimalString
}

/**
 * 过滤出未结清应收单并按紧迫度排序（domain compareReceivableUrgency：
 * dueDate 较早 → statementDate 较早 → id 升序；无 dueDate 排最后）。
 */
export function buildOpenReceivableRows(views: ReceivableView[]): AllocationRowView[] {
  return views
    .filter((view) => compareAmounts(view.summary.outstandingAmount, '0') > 0)
    .slice()
    .sort((a, b) => compareReceivableUrgency(a.receivable, b.receivable))
    .map((view) => ({
      receivableId: view.receivable.id,
      statementNo: view.receivable.statementNo,
      accountingMonth: view.receivable.accountingMonth,
      dueDate: view.receivable.dueDate,
      originalAmount: view.receivable.originalAmount,
      paidAmount: view.summary.paidAmount,
      outstandingAmount: view.summary.outstandingAmount,
    }))
}

/* --------------------------- 命令构建 --------------------------- */

/** 登记表单草稿（UI 状态 → 命令的中间载体） */
export interface ReceiptRegistrationDraft {
  /** 幂等键（同一表单会话内稳定，重复提交由 Store 幂等去重兜底） */
  idempotencyKey: string
  customerId: EntityId
  receiptDate: LocalDate
  accountId: EntityId
  /** 实际收款金额（AmountInput 归一化后的 DecimalString） */
  actualAmount: DecimalString
  externalRef: string
  remark: string
  /** 核销行输入（应收单 ID → 用户输入金额；空串表示未分配该单） */
  amounts: Record<EntityId, string>
}

/**
 * 构建核销草稿：跳过空输入；非空输入原样保留（含非法/零值），
 * 交由 Store/domain 校验拒绝（UI 校验不可替代 Store 校验）。
 */
export function buildAllocationDrafts(amounts: Record<EntityId, string>): ReceiptAllocationDraft[] {
  return Object.entries(amounts)
    .filter(([, raw]) => raw.trim() !== '')
    .map(([receivableId, raw]) => ({ receivableId, allocationAmount: raw.trim() }))
}

/** 构建核销预览命令（不落库） */
export function buildPreviewCommand(draft: ReceiptRegistrationDraft): PreviewReceiptAllocationCommand {
  return {
    customerId: draft.customerId,
    actualAmount: draft.actualAmount,
    allocations: buildAllocationDrafts(draft.amounts),
  }
}

/** 构建确认收款命令：空串外部参考号/备注归一化为 null（空值语义统一） */
export function buildConfirmReceiptCommand(draft: ReceiptRegistrationDraft): ConfirmReceiptCommand {
  return {
    idempotencyKey: draft.idempotencyKey,
    customerId: draft.customerId,
    receiptDate: draft.receiptDate,
    accountId: draft.accountId,
    actualAmount: draft.actualAmount,
    externalRef: draft.externalRef.trim() === '' ? null : draft.externalRef.trim(),
    remark: draft.remark.trim() === '' ? null : draft.remark.trim(),
    allocations: buildAllocationDrafts(draft.amounts),
  }
}

/** 归一化展示金额（非法输入返回 null，展示层回退 '—'） */
export function canonicalDisplayAmount(value: string): DecimalString | null {
  const normalized = normalizeAmount(value)
  return normalized === null ? null : canonicalAmount2(normalized)
}
