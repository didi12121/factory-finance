/**
 * Prototype Contract V1 — 查询契约（分页、排序、筛选；不实现业务逻辑）。
 *
 * 分页模型与后端 API_CONTRACT.md 第 4 节对齐：
 * - `page` ≥ 1（默认 1）；`size` 1–500（默认 20）；越界参数后端返回 VALIDATION_ERROR。
 * 筛选约定：可选筛选项缺省（undefined）表示"不限"。
 */

import type {
  CustomerStatus,
  ReceivableStatus,
  TransactionDirection,
  TransactionType,
  FundTransactionStatus,
} from './enums'
import type { EntityId, LocalDate } from './types'
import type { PageQuery } from '@/types/api'

/** 统一分页请求模型（复用 @/types/api，与后端 PageQuery 对齐：page ≥ 1，size 1–500） */
export type { PageQuery } from '@/types/api'
/** 统一分页响应模型（复用 @/types/api：items 当前页数据、total 总条数、page 当前页码、size 每页条数） */
export type { PageResult } from '@/types/api'

/** 排序方向 */
export type SortDirection = 'ASC' | 'DESC'

/**
 * 排序约定。
 * **金额列排序必须使用 utils/decimal.ts 的 compareAmounts 精确比较**（BigInt 定点），
 * 禁止 Number/parseFloat 参与财务金额排序。
 */
export interface SortSpec {
  /** 排序字段（实体字段名） */
  field: string
  /** 排序方向 */
  direction: SortDirection
}

/** 日期范围（闭区间）；`from`/`to` 为 null 表示该端不限，from ≤ to */
export interface LocalDateRange {
  from: LocalDate | null
  to: LocalDate | null
}

/** 分页 + 可选排序的通用列表查询基类 */
export interface ListQuery extends PageQuery {
  /** 排序约定；缺省由实现给出默认排序 */
  sort?: SortSpec
}

/** 客户列表筛选（主数据） */
export interface CustomerListQuery extends ListQuery {
  /** 关键字（客户名称模糊匹配，具体语义由实现约定） */
  keyword?: string
  /** 启用状态筛选 */
  status?: CustomerStatus
}

/** 资金账户列表筛选 */
export interface FundAccountListQuery extends ListQuery {
  /** 关键字（账户名称模糊匹配） */
  keyword?: string
  /** 启用状态筛选 */
  enabled?: boolean
}

/** 资金流水列表筛选（关键字、日期范围、账户、类型、方向、状态） */
export interface FundTransactionListQuery extends ListQuery {
  /** 关键字（流水编号/对手方/备注，语义由实现约定） */
  keyword?: string
  /** 业务发生日期范围 */
  dateRange?: LocalDateRange
  /** 资金账户 */
  accountId?: EntityId
  /** 业务交易类型 */
  transactionType?: TransactionType
  /** 收付方向 */
  direction?: TransactionDirection
  /** 流水状态 */
  status?: FundTransactionStatus
}

/** 应收列表筛选（关键字、日期范围、客户、回款状态、逾期派生筛选） */
export interface ReceivableListQuery extends ListQuery {
  /** 关键字（对账单编号/客户名称，语义由实现约定） */
  keyword?: string
  /** 对账日期范围 */
  dateRange?: LocalDateRange
  /** 客户 */
  customerId?: EntityId
  /** 回款状态（UNPAID/PARTIALLY_PAID/SETTLED） */
  status?: ReceivableStatus
  /** 仅看逾期（派生属性筛选，与回款状态独立） */
  overdueOnly?: boolean
}

/** 收款单列表筛选（关键字、日期范围、客户、账户） */
export interface ReceiptListQuery extends ListQuery {
  /** 关键字（收款单编号/外部参考号/备注，语义由实现约定） */
  keyword?: string
  /** 实际到账日期范围 */
  dateRange?: LocalDateRange
  /** 客户 */
  customerId?: EntityId
  /** 入账资金账户 */
  accountId?: EntityId
}
