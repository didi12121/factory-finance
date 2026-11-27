/**
 * 回款核销规则（纯函数）：校验、预览、自动分配。
 *
 * 红线（PROTOTYPE_DATA_CONTRACT 第 3 节）：
 * - 实际收款金额 > 0；每条核销金额 > 0；核销总额 ≤ 实际收款金额；
 * - 单张应收累计核销 ≤ 原始应收；不得跨客户核销；不得核销已结清/不存在应收单；
 * - 重复分配项直接拒绝；账户必须存在且启用；
 * - 全额分配限制：累计分配 = 实际收款金额才允许确认；未分配 > 0 仅展示提示
 *   （预收款规则待 Phase 2 确认），禁止确认收款；
 * - 自动分配只生成预览（不落任何状态）。
 *
 * 本模块全部为纯函数：输入输出类型来自 contracts，金额运算走 utils/decimal.ts
 * （BigInt 定点），禁止 parseFloat / Number / Math.round 参与财务计算。
 */

import { compareAmounts, subtractAmounts, type DecimalString } from '@/utils/decimal'
import { normalizeAmount } from '@/utils/money'
import { DEMO_TODAY } from '../contracts'
import type {
  AllocationPreview,
  AutoAllocateReceiptCommand,
  BusinessError,
  BusinessErrorCode,
  ConfirmReceiptCommand,
  Customer,
  EntityId,
  FundAccount,
  PreviewReceiptAllocationCommand,
  ReceiptAllocation,
  ReceiptAllocationDraft,
  Receivable,
} from '../contracts'
import { canonicalAmount2, sumAmounts } from './amounts'
import { isValidLocalDate } from './dateRules'
import { compareReceivableUrgency, deriveReceivableSummary } from './receivable'

/** 核销校验上下文（Store/Repository 提供的当前只读状态切片） */
export interface AllocationContext {
  customers: Customer[]
  fundAccounts: FundAccount[]
  receivables: Receivable[]
  receiptAllocations: ReceiptAllocation[]
}

/** 核销方案校验结果（含总额与未分配金额，供预览/校验复用） */
interface AllocationPlanCheck {
  errors: BusinessError[]
  totalAllocated: DecimalString
  unallocated: DecimalString
}

function bizError(
  code: BusinessErrorCode,
  message: string,
  fieldErrors?: Record<string, string>,
): BusinessError {
  return fieldErrors === undefined ? { code, message } : { code, message, fieldErrors }
}

/** 归一化一条核销草稿（非法/非正金额在 errors 中记录） */
function normalizeDraftAmount(
  raw: string,
  errors: BusinessError[],
): DecimalString | null {
  const normalized = normalizeAmount(raw)
  if (normalized === null) {
    errors.push(bizError('VALIDATION_ERROR', '核销金额格式非法', { allocations: '核销金额必须为最多两位小数的十进制金额' }))
    return null
  }
  if (compareAmounts(normalized, '0') <= 0) {
    errors.push(bizError('VALIDATION_ERROR', '核销金额必须大于 0', { allocations: '单笔核销金额必须大于 0' }))
    return null
  }
  return normalized
}

/**
 * 核销方案核心校验（预览与确认共用）：
 * 实际收款 > 0、每条核销 > 0、无重复应收单、应收存在且未结清且同客户、
 * 单张累计核销 ≤ 原始应收、核销总额 ≤ 实际收款、全额分配（未分配 > 0 禁止确认）。
 */
function checkAllocationPlan(
  customerId: EntityId,
  actualAmountRaw: string,
  allocations: ReceiptAllocationDraft[],
  context: AllocationContext,
): AllocationPlanCheck {
  const errors: BusinessError[] = []

  const actual = normalizeAmount(actualAmountRaw)
  if (actual === null) {
    errors.push(bizError('VALIDATION_ERROR', '实际收款金额格式非法', { actualAmount: '必须为最多两位小数的十进制金额' }))
  } else if (compareAmounts(actual, '0') <= 0) {
    errors.push(bizError('VALIDATION_ERROR', '实际收款金额必须大于 0', { actualAmount: '实际收款金额必须大于 0' }))
  }

  const customer = context.customers.find((item) => item.id === customerId)
  if (customer === undefined) {
    errors.push(bizError('NOT_FOUND', '客户不存在', { customerId: '客户不存在' }))
  } else if (customer.status !== 'ENABLED') {
    errors.push(bizError('VALIDATION_ERROR', '客户已停用，不可登记新收款单', { customerId: '客户已停用' }))
  }

  const normalizedDrafts: Array<{ receivableId: EntityId; amount: DecimalString }> = []
  const seen = new Set<EntityId>()
  for (const draft of allocations) {
    if (seen.has(draft.receivableId)) {
      errors.push(bizError('VALIDATION_ERROR', '核销明细中存在重复的应收单', { allocations: '同一应收单不允许重复核销' }))
      continue
    }
    seen.add(draft.receivableId)
    const amount = normalizeDraftAmount(draft.allocationAmount, errors)
    if (amount !== null) {
      normalizedDrafts.push({ receivableId: draft.receivableId, amount })
    }
  }

  // 按应收单归并（重复项已在上面拒绝），逐张校验存在性/归属/结清/累计上限
  const draftSumByReceivable = new Map<EntityId, DecimalString>()
  for (const draft of normalizedDrafts) {
    const prev = draftSumByReceivable.get(draft.receivableId) ?? '0'
    draftSumByReceivable.set(draft.receivableId, sumAmounts([prev, draft.amount]))
  }
  for (const [receivableId, draftSum] of draftSumByReceivable) {
    const receivable = context.receivables.find((item) => item.id === receivableId)
    if (receivable === undefined) {
      errors.push(bizError('NOT_FOUND', `应收单不存在：${receivableId}`, { allocations: '核销目标应收单不存在' }))
      continue
    }
    if (receivable.customerId !== customerId) {
      errors.push(bizError('VALIDATION_ERROR', '不允许跨客户核销', { allocations: '核销明细必须属于同一客户' }))
      continue
    }
    const summary = deriveReceivableSummary(receivable, context.receiptAllocations)
    if (compareAmounts(summary.outstandingAmount, '0') <= 0) {
      errors.push(bizError('VALIDATION_ERROR', `应收单已收清，不可继续核销：${receivable.statementNo}`, { allocations: '应收单已结清' }))
      continue
    }
    const cumulative = sumAmounts([summary.paidAmount, draftSum])
    if (compareAmounts(cumulative, receivable.originalAmount) > 0) {
      errors.push(bizError('VALIDATION_ERROR', `累计核销金额超过应收单原始金额：${receivable.statementNo}`, { allocations: '累计核销金额不得超过原始应收金额' }))
    }
  }

  const totalAllocated = canonicalAmount2(sumAmounts(normalizedDrafts.map((item) => item.amount)))
  let unallocated: DecimalString = '0.00'
  if (actual !== null && compareAmounts(actual, '0') > 0) {
    if (compareAmounts(totalAllocated, actual) > 0) {
      errors.push(bizError('VALIDATION_ERROR', '核销总额超过实际收款金额', { allocations: '核销总额不得超过实际收款金额' }))
    } else {
      unallocated = canonicalAmount2(subtractAmounts(actual, totalAllocated))
      if (compareAmounts(unallocated, '0') > 0) {
        // 全额分配限制：预收款规则待 Phase 2 确认，当前禁止确认未分配收款
        errors.push(
          bizError(
            'VALIDATION_ERROR',
            `存在未分配金额 ${unallocated}，预收款规则待 Phase 2 确认，当前禁止确认收款`,
            { allocations: '累计核销金额必须等于实际收款金额' },
          ),
        )
      }
    }
  }

  return { errors, totalAllocated, unallocated }
}

/** 预览回显：合法金额规范化为两位小数，非法金额原样保留供 UI 展示 */
function echoDrafts(allocations: ReceiptAllocationDraft[]): ReceiptAllocationDraft[] {
  return allocations.map((draft) => {
    const normalized = normalizeAmount(draft.allocationAmount)
    return {
      receivableId: draft.receivableId,
      allocationAmount: normalized === null ? draft.allocationAmount.trim() : canonicalAmount2(normalized),
    }
  })
}

function buildPreview(
  customerId: EntityId,
  actualAmountRaw: string,
  allocations: ReceiptAllocationDraft[],
  context: AllocationContext,
): AllocationPreview {
  const check = checkAllocationPlan(customerId, actualAmountRaw, allocations, context)
  return {
    allocations: echoDrafts(allocations),
    totalAllocated: check.totalAllocated,
    unallocated: check.unallocated,
    validationErrors: check.errors,
  }
}

/**
 * 确认前校验（确认路径的最终防线，返回错误列表，空数组表示可确认）：
 * 核销核心校验 + 到账日期（真实公历且 ≤ DEMO_TODAY）/资金账户/幂等键校验。
 * 业务日期一致性在 Store/Domain 层强制（禁止仅 UI 限制）：
 * 实际到账日期为未来日期（> DEMO_TODAY）必须拒绝，DEMO_TODAY 当日允许。
 */
export function validateReceiptAllocation(
  cmd: ConfirmReceiptCommand,
  context: AllocationContext,
): BusinessError[] {
  const errors = checkAllocationPlan(cmd.customerId, cmd.actualAmount, cmd.allocations, context).errors

  if (!isValidLocalDate(cmd.receiptDate)) {
    errors.push(bizError('VALIDATION_ERROR', '到账日期格式非法', { receiptDate: '到账日期必须为真实存在的 YYYY-MM-DD 日期' }))
  } else if (cmd.receiptDate > DEMO_TODAY) {
    errors.push(
      bizError('VALIDATION_ERROR', `实际到账日期不得晚于演示基准日 ${DEMO_TODAY}（未来日期收款必须拒绝）`, {
        receiptDate: `实际到账日期不得为未来日期（≤ ${DEMO_TODAY}）`,
      }),
    )
  }

  const account = context.fundAccounts.find((item) => item.id === cmd.accountId)
  if (account === undefined) {
    errors.push(bizError('NOT_FOUND', '资金账户不存在', { accountId: '资金账户不存在' }))
  } else if (!account.enabled) {
    errors.push(bizError('VALIDATION_ERROR', '资金账户已停用，不可新增流水', { accountId: '资金账户已停用' }))
  }

  if (cmd.idempotencyKey.trim() === '') {
    errors.push(bizError('VALIDATION_ERROR', '幂等键不能为空', { idempotencyKey: '幂等键不能为空' }))
  }

  return errors
}

/** 手动核销草稿预览（不落库）：已分配 / 未分配 / 校验错误 */
export function previewReceiptAllocation(
  cmd: PreviewReceiptAllocationCommand,
  context: AllocationContext,
): AllocationPreview {
  return buildPreview(cmd.customerId, cmd.actualAmount, cmd.allocations, context)
}

/**
 * 自动核销建议（只预览不落状态）：
 * 在同一客户的未结清应收中按「dueDate 较早 → statementDate 较早 → id 稳定排序」
 * （无 dueDate 排在有 dueDate 之后）依次足额分配，直至实际收款金额用尽。
 */
export function autoAllocateReceipt(
  cmd: AutoAllocateReceiptCommand,
  context: AllocationContext,
): AllocationPreview {
  const actual = normalizeAmount(cmd.actualAmount)
  if (actual === null || compareAmounts(actual, '0') <= 0) {
    return buildPreview(cmd.customerId, cmd.actualAmount, [], context)
  }
  const customer = context.customers.find((item) => item.id === cmd.customerId)
  if (customer === undefined || customer.status !== 'ENABLED') {
    return buildPreview(cmd.customerId, cmd.actualAmount, [], context)
  }

  const openReceivables = context.receivables
    .filter((item) => item.customerId === cmd.customerId)
    .filter((item) => {
      const summary = deriveReceivableSummary(item, context.receiptAllocations)
      return compareAmounts(summary.outstandingAmount, '0') > 0
    })
    .sort(compareReceivableUrgency)

  let remaining = actual
  const drafts: ReceiptAllocationDraft[] = []
  for (const receivable of openReceivables) {
    if (compareAmounts(remaining, '0') <= 0) {
      break
    }
    const summary = deriveReceivableSummary(receivable, context.receiptAllocations)
    const take =
      compareAmounts(remaining, summary.outstandingAmount) <= 0
        ? remaining
        : summary.outstandingAmount
    drafts.push({ receivableId: receivable.id, allocationAmount: canonicalAmount2(take) })
    remaining = subtractAmounts(remaining, take)
  }

  return buildPreview(cmd.customerId, cmd.actualAmount, drafts, context)
}
