/**
 * 经营概览 —— 跨页面导航路径构造（集中、可测）。
 *
 * 契约优先：
 * - 回款流程入口一律使用冻结契约 `buildProcessingFeeCreatePath()`；
 * - 应收页面路径使用冻结常量 `RECEIVABLES_ROUTE_PATH`；
 * - 其余视图路径（资金流水、应收详情）在冻结契约未提供构造函数时，
 *   由本模块集中定义常量/构造函数，避免在组件里散落手拼字符串。
 *
 * 本模块只构造路径字符串，不产生导航副作用（跳转由组件调用 router）。
 */

import {
  RECEIVABLES_ROUTE_PATH,
  buildProcessingFeeCreatePath,
  type ProcessingFeeCreateParams,
} from '@/features/prototype/contracts'
import type { EntityId } from '@/features/prototype/contracts'

/** 资金流水列表路径（资金模块视图） */
export const TREASURY_TRANSACTIONS_ROUTE_PATH = '/treasury/transactions'

/** 应收列表路径（复用冻结契约常量） */
export const RECEIVABLES_PATH = RECEIVABLES_ROUTE_PATH

/** 应收详情路径：/business/receivables/:id */
export function buildReceivableDetailPath(id: EntityId): string {
  return `${RECEIVABLES_ROUTE_PATH}/${id}`
}

/** 资金流水列表路径 */
export function buildTransactionsPath(): string {
  return TREASURY_TRANSACTIONS_ROUTE_PATH
}

/**
 * 新建记录（回款登记）路径 —— 复用冻结契约构造函数。
 * 新建记录入口只展示已支持的演示业务，故仅暴露回款登记。
 */
export function buildNewRecordPath(params: ProcessingFeeCreateParams = {}): string {
  return buildProcessingFeeCreatePath(params)
}

export { buildProcessingFeeCreatePath, RECEIVABLES_ROUTE_PATH }
