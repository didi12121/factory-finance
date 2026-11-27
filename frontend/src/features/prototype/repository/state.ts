/**
 * 原型内存状态容器（Mock Store 的唯一业务状态载体）。
 *
 * 演示数据隔离说明：
 * - 本状态仅用于开发/测试环境的原型演示（虚构演示数据），不写入任何后端、不持久化；
 * - 页面刷新 / Store 重建时通过 `createInitialPrototypeState()`（data/fixtures.ts）恢复初始数据；
 * - 禁止在此冗余存储应收已收/未收/状态/逾期与账户余额（一律由 domain 派生/重算）。
 */

import type {
  Customer,
  EntityId,
  FundAccount,
  FundTransaction,
  Receipt,
  ReceiptAllocation,
  Receivable,
} from '../contracts'

/**
 * 幂等键去重记录（内部索引，不参与页面展示）。
 * 同键重复提交：paramsHash 一致 → 返回原收款单；不一致 → CONFLICT 拒绝。
 */
export interface IdempotencyRecord {
  /** 首次确认生成的收款单 ID */
  receiptId: EntityId
  /** 业务参数哈希（hashReceiptCommandParams，用于识别同键不同参数） */
  paramsHash: string
}

/**
 * 原型业务状态：客户 / 资金账户 / 资金流水 / 应收单 / 收款单 / 核销明细 + 幂等索引。
 * 单一数据源：所有页面 Agent 通过 usePrototypeStore 读取，禁止各自复制数据。
 */
export interface PrototypeState {
  customers: Customer[]
  fundAccounts: FundAccount[]
  fundTransactions: FundTransaction[]
  receivables: Receivable[]
  receipts: Receipt[]
  receiptAllocations: ReceiptAllocation[]
  /** 幂等键 → 去重记录 */
  idempotencyRecords: Record<string, IdempotencyRecord>
}

/** 空状态（测试/工具用） */
export function createEmptyPrototypeState(): PrototypeState {
  return {
    customers: [],
    fundAccounts: [],
    fundTransactions: [],
    receivables: [],
    receipts: [],
    receiptAllocations: [],
    idempotencyRecords: {},
  }
}
