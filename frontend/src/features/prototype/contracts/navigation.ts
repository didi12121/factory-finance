/**
 * Prototype Contract V1 — 跨页面路由契约（**冻结**，Phase 0.2 原型阶段不得改动）。
 *
 * 回款流程入口唯一契约：
 *   /business/processing-fee?action=create[&customerId=...][&receivableId=...]
 *
 * 不变量：
 * - 应收页**只允许通过该契约**进入回款流程（携带 receivableId/customerId），
 *   禁止在应收页直接修改收款/核销状态；
 * - 查询参数顺序冻结为 action → customerId → receivableId；缺省参数省略；
 * - 页面 Agent 之间跳转必须使用本模块的常量与构造函数，禁止手拼路径字符串。
 */

import type { EntityId } from './types'

/** 加工费/回款页面路由路径（冻结） */
export const PROCESSING_FEE_ROUTE_PATH = '/business/processing-fee'

/** 应收页面路由路径（回款流程的上游入口页） */
export const RECEIVABLES_ROUTE_PATH = '/business/receivables'

/**
 * 回款流程动作（查询参数 action 的取值）。
 * V1 仅定义 create：新建回款（加工费收款）。
 */
export type ProcessingFeeAction = 'create'

/** 回款流程入口查询参数（customerId / receivableId 均可选，缺省省略） */
export interface ProcessingFeeCreateParams {
  /** 目标客户（从客户维度进入时携带） */
  customerId?: EntityId
  /** 目标应收单（应收页进入回款流程时携带，用于定位待核销单据） */
  receivableId?: EntityId
}

/**
 * 构造回款流程入口路径（冻结契约）。
 *
 * buildProcessingFeeCreatePath()
 *   → '/business/processing-fee?action=create'
 * buildProcessingFeeCreatePath({ customerId: 'c1', receivableId: 'r1' })
 *   → '/business/processing-fee?action=create&customerId=c1&receivableId=r1'
 */
export function buildProcessingFeeCreatePath(params: ProcessingFeeCreateParams = {}): string {
  const search = new URLSearchParams()
  search.set('action', 'create')
  if (params.customerId !== undefined) {
    search.set('customerId', params.customerId)
  }
  if (params.receivableId !== undefined) {
    search.set('receivableId', params.receivableId)
  }
  return `${PROCESSING_FEE_ROUTE_PATH}?${search.toString()}`
}
