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
 * 同键重复提交：canonicalParams（规范化业务参数）一致 → 返回原收款单；不一致 → CONFLICT 拒绝。
 */
export interface IdempotencyRecord {
  /** 首次确认生成的收款单 ID */
  receiptId: EntityId
  /**
   * 规范化业务参数串（repository/idempotency.ts 的结构化长度前缀序列化）。
   * **幂等等价性判据：直接比较本串**（内存原型），禁止以哈希为唯一判据。
   */
  canonicalParams: string
  /** 业务参数哈希（hashReceiptCommandParams，仅索引优化，不作等价性判据） */
  paramsHash: string
}

/**
 * 幂等索引容器（Record 承载，但访问语义强制防原型链误命中/防原型污染）：
 *
 * - 读取必须经 `getIdempotencyRecord`（own-property 检查）：
 *   'constructor'、'toString'、'__proto__'、'hasOwnProperty' 等 Object.prototype
 *   键**不得参与查询命中**（禁止 `records[key]` 直读原型链）；
 * - 写入必须经 `setIdempotencyRecord`（Object.defineProperty 自有属性写入）：
 *   '__proto__' 等键不得触发原型 setter、不得污染原型链；
 * - `createEmptyPrototypeState()` 使用 `Object.create(null)`（无原型空容器）；
 *   Fixture 初始化（data/fixtures.ts `createInitialPrototypeState()`）为普通空对象，
 *   与空容器**语义一致**：幂等索引均以「零自有键」起步。
 *
 * **历史 Fixture 收款单与幂等索引的初始化语义（固定约定）**：
 * 历史演示收款单（DEMO_RECEIPTS）**不预置幂等记录**——幂等索引只约束「新确认操作」
 * （confirmReceipt 的重复提交去重），不回溯约束迁移/导入/演示数据；
 * 因此用历史收款单的 idempotencyKey 发起新确认会创建新收款单（而非命中历史单），
 * 与 `resetDemoData()` 恢复初始状态后的语义完全一致。
 */
export type IdempotencyRecordMap = Record<string, IdempotencyRecord>

/** 读取幂等记录（own-property 检查，原型链键恒不命中） */
export function getIdempotencyRecord(
  records: IdempotencyRecordMap,
  key: string,
): IdempotencyRecord | undefined {
  return Object.prototype.hasOwnProperty.call(records, key) ? records[key] : undefined
}

/** 写入幂等记录（defineProperty 自有属性写入，'__proto__' 等键不污染原型链） */
export function setIdempotencyRecord(
  records: IdempotencyRecordMap,
  key: string,
  record: IdempotencyRecord,
): void {
  Object.defineProperty(records, key, {
    value: record,
    writable: true,
    enumerable: true,
    configurable: true,
  })
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
  /** 幂等键 → 去重记录（访问一律经 getIdempotencyRecord/setIdempotencyRecord） */
  idempotencyRecords: IdempotencyRecordMap
}

/** 空状态（测试/工具用）；幂等索引为无原型空容器（零自有键） */
export function createEmptyPrototypeState(): PrototypeState {
  return {
    customers: [],
    fundAccounts: [],
    fundTransactions: [],
    receivables: [],
    receipts: [],
    receiptAllocations: [],
    idempotencyRecords: Object.create(null) as IdempotencyRecordMap,
  }
}
