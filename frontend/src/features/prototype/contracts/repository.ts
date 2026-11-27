/**
 * Prototype Contract V1 — Repository/Store 接口（只声明语义方法，不实现业务逻辑）。
 *
 * 实现约定：
 * - Phase 0.2 由 Mock Store 实现本接口（内存数据，明确标记虚构演示数据）；
 * - 后续阶段由真实 API 服务实现同一接口，页面层无感知替换；
 * - 所有方法返回 Promise（保证 Mock 与真实 API 行为一致，可平滑替换）；
 * - 写操作必须遵守 ACCOUNTING_RULES.md 红线：同事务提交、幂等、
 *   资金流水唯一、核销不产生新资金流水、禁止物理删除。
 */

import type {
  AllocationPreview,
  AutoAllocateReceiptCommand,
  ConfirmReceiptCommand,
  CreateReceivableCommand,
  PreviewReceiptAllocationCommand,
} from './commands'
import type { BusinessError } from './errors'
import type {
  CustomerListQuery,
  FundAccountListQuery,
  FundTransactionListQuery,
  PageResult,
  ReceivableListQuery,
  ReceiptListQuery,
} from './query'
import type {
  Customer,
  DashboardPeriod,
  DashboardSummary,
  EntityId,
  FundAccount,
  FundTransaction,
  Receipt,
  ReceiptAllocation,
  Receivable,
  ReceivableView,
} from './types'

/** 收款单详情（收款单 + 其核销明细） */
export interface ReceiptDetail {
  receipt: Receipt
  /** 该收款单的核销明细（Σ核销金额 ≤ receipt.actualAmount） */
  allocations: ReceiptAllocation[]
}

/**
 * 原型数据仓储契约（Mock Store 与后续真实 API 的共同接口）。
 * 查询返回分页模型（PageResult，与后端 API_CONTRACT 对齐）；查询无结果返回空页/ null。
 */
export interface PrototypeRepository {
  /** 客户列表 */
  listCustomers(query: CustomerListQuery): Promise<PageResult<Customer>>
  /** 资金账户列表 */
  listFundAccounts(query: FundAccountListQuery): Promise<PageResult<FundAccount>>
  /** 资金流水列表 */
  listFundTransactions(query: FundTransactionListQuery): Promise<PageResult<FundTransaction>>
  /** 应收列表（含派生统计） */
  listReceivables(query: ReceivableListQuery): Promise<PageResult<ReceivableView>>
  /** 按 ID 查询应收（含派生统计）；不存在返回 null */
  getReceivableById(id: EntityId): Promise<ReceivableView | null>
  /** 某张应收单的核销明细（已收明细，按核销时间排序语义由实现约定） */
  listReceivableAllocations(receivableId: EntityId): Promise<ReceiptAllocation[]>
  /** 收款单列表 */
  listReceipts(query: ReceiptListQuery): Promise<PageResult<Receipt>>
  /** 按 ID 查询收款单（含核销明细）；不存在返回 null */
  getReceiptById(id: EntityId): Promise<ReceiptDetail | null>
  /** 看板汇总（派生统计，金额均为 DecimalString） */
  getDashboardSummary(period: DashboardPeriod): Promise<DashboardSummary>

  /** 新建应收（加工费对账单登记）；返回生成的应收单 */
  createReceivable(command: CreateReceivableCommand): Promise<Receivable>
  /** 核销方案预览（含校验错误，不落库） */
  previewReceiptAllocation(command: PreviewReceiptAllocationCommand): Promise<AllocationPreview>
  /** 自动建议核销明细（不落库；分配规则由实现定义） */
  autoAllocateReceipt(command: AutoAllocateReceiptCommand): Promise<AllocationPreview>
  /** 确认前校验核销方案（含 externalError 类业务规则）；返回错误列表，空数组表示可确认 */
  validateReceiptAllocation(command: ConfirmReceiptCommand): Promise<BusinessError[]>
  /** 确认收款：生成收款单 + 一条资金流入流水 + 核销明细（同事务、幂等）；返回收款单 */
  confirmReceipt(command: ConfirmReceiptCommand): Promise<Receipt>
}
