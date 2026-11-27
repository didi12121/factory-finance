/**
 * Prototype Contract V1 — 命令与结果类型（不实现业务逻辑）。
 *
 * 命令为"写操作意图"的完整载体（幂等、事务一致语义见各字段注释）；
 * 实现（Mock Store / 真实 API）必须保证：业务单据、资金变动、核销同事务提交且幂等。
 */

import type { BusinessError } from './errors'
import type { AccountingMonth, DecimalString, EntityId, LocalDate } from './types'

/** 核销明细草稿（未落库；ConfirmReceiptCommand/预览共用的核销行） */
export interface ReceiptAllocationDraft {
  /** 目标应收单 */
  receivableId: EntityId
  /**
   * 核销金额（DECIMAL(18,2) 十进制字符串）。
   * 不变量：单笔核销金额 > 0；单张应收累计核销 ≤ 原始应收金额。
   */
  allocationAmount: DecimalString
}

/**
 * 新建应收命令（加工费对账单登记）。
 * 确认后生成应收单（原始金额 = amount），已收/状态/逾期由后续核销派生。
 */
export interface CreateReceivableCommand {
  /** 客户 */
  customerId: EntityId
  /** 会计期间（YYYY-MM） */
  accountingMonth: AccountingMonth
  /** 对账日期（业务日期） */
  statementDate: LocalDate
  /** 到期日；null 表示未约定到期日（不得据此判定逾期） */
  dueDate: LocalDate | null
  /** 应收原始金额（DECIMAL(18,2) 十进制字符串） */
  amount: DecimalString
  /** 备注；null 表示无备注 */
  remark: string | null
}

/**
 * 确认收款命令（生成收款单 + 一条资金流入流水 + 核销明细，同事务提交）。
 *
 * 不变量：
 * - 一笔实际收款只记一次资金流入（禁止因核销多单重复计入资金余额）；
 * - Σ allocations.allocationAmount ≤ actualAmount（未分配部分按预收/未分配规则处理，
 *   具体规则待架构师确认）；
 * - **幂等**：同一 idempotencyKey 重复提交不得重复记账。
 */
export interface ConfirmReceiptCommand {
  /** 幂等键（去重键设计方案待架构师确认，本字段为契约占位） */
  idempotencyKey: string
  /** 客户 */
  customerId: EntityId
  /** 实际到账日期（资金事实日期） */
  receiptDate: LocalDate
  /** 入账资金账户 */
  accountId: EntityId
  /** 实际收款金额（DECIMAL(18,2) 十进制字符串） */
  actualAmount: DecimalString
  /** 外部参考号（如银行流水号）；null 表示无 */
  externalRef: string | null
  /** 备注；null 表示无备注 */
  remark: string | null
  /** 核销明细（可为空数组表示暂不核销；未分配规则待架构师确认） */
  allocations: ReceiptAllocationDraft[]
}

/** 核销方案预览输入（不落库） */
export interface PreviewReceiptAllocationCommand {
  /** 客户（限定可核销应收范围） */
  customerId: EntityId
  /** 实际收款金额 */
  actualAmount: DecimalString
  /** 拟核销明细 */
  allocations: ReceiptAllocationDraft[]
}

/**
 * 自动核销建议输入（不落库）。
 * 自动分配规则（如按到期日先后）由实现定义，仅生成预览，不得直接落库。
 */
export interface AutoAllocateReceiptCommand {
  /** 客户 */
  customerId: EntityId
  /** 实际收款金额 */
  actualAmount: DecimalString
}

/**
 * 核销预览结果（不落库）。
 * 不变量：totalAllocated = Σ allocations.allocationAmount；
 * unallocated = actualAmount − totalAllocated（≥ 0）。
 */
export interface AllocationPreview {
  /** 预览核销明细（与输入一致或为自动建议结果） */
  allocations: ReceiptAllocationDraft[]
  /** 核销总额（DECIMAL(18,2)） */
  totalAllocated: DecimalString
  /** 未分配金额（DECIMAL(18,2)，= actualAmount − totalAllocated，恒 ≥ 0） */
  unallocated: DecimalString
  /** 校验错误（空数组表示核销方案可提交） */
  validationErrors: BusinessError[]
}
