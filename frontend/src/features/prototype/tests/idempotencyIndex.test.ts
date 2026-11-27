/**
 * 幂等键索引加固测试（Task A2）：
 * 原型链键（'constructor'/'toString'/'__proto__'/'hasOwnProperty' 等）不产生意外命中
 * 与原型污染；幂等索引 Map 语义（own-property 访问）；历史 Fixture 收款单不预置幂等记录；
 * resetDemoData 与 Fixture 初始化语义一致（均以零自有键幂等索引起步）。
 */

import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ConfirmReceiptCommand } from '../contracts'
import { createInitialPrototypeState } from '../data/fixtures'
import {
  getIdempotencyRecord,
  setIdempotencyRecord,
  createEmptyPrototypeState,
} from '../repository/state'
import { MemoryPrototypeRepository } from '../repository/memoryPrototypeRepository'
import { usePrototypeStore } from '../stores/prototype'
import { captureBusinessErrors, expectErrorContaining } from './helpers'

function makeCommand(overrides: Partial<ConfirmReceiptCommand> = {}): ConfirmReceiptCommand {
  return {
    idempotencyKey: 'idx-key-1',
    customerId: 'cust-a',
    receiptDate: '2026-11-30',
    accountId: 'acct-bank',
    actualAmount: '100.00',
    externalRef: null,
    remark: null,
    allocations: [{ receivableId: 'ar-001', allocationAmount: '100.00' }],
    ...overrides,
  }
}

/** 原型链敏感键（普通对象索引会误命中或污染，Map/own-property 语义必须免疫） */
const PROTOTYPE_KEYS = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']

describe('幂等索引 — 原型链键安全（own-property 语义）', () => {
  it('原型链键不误命中：首次确认成功、同键同参返回原结果、同键异参 CONFLICT', async () => {
    for (const key of PROTOTYPE_KEYS) {
      const state = createInitialPrototypeState()
      const repo = new MemoryPrototypeRepository(state)
      const first = await repo.confirmReceipt(makeCommand({ idempotencyKey: key }))
      expect(state.receipts.length).toBe(9)

      // 同键同参重复提交：返回原收款单（不得因 Object.prototype 属性误判冲突）
      const replay = await repo.confirmReceipt(makeCommand({ idempotencyKey: key }))
      expect(replay.id).toBe(first.id)
      expect(state.receipts.length).toBe(9)
      expect(state.fundTransactions.length).toBe(23)
      expect(state.receiptAllocations.length).toBe(11)

      // 同键异参：CONFLICT 拒绝且零状态变化
      const errors = await captureBusinessErrors(() =>
        repo.confirmReceipt(
          makeCommand({ idempotencyKey: key, actualAmount: '200.00', allocations: [{ receivableId: 'ar-001', allocationAmount: '200.00' }] }),
        ),
      )
      expect(errors[0]?.code).toBe('CONFLICT')
      expectErrorContaining(errors, '业务参数不一致')
      expect(state.receipts.length).toBe(9)
    }
  })

  it('原型链键写入不污染原型链：\'__proto__\' 记录为自有属性，Object.prototype 干净', async () => {
    const state = createInitialPrototypeState()
    const repo = new MemoryPrototypeRepository(state)
    const records = state.idempotencyRecords
    const protoBefore = Object.getPrototypeOf(records)

    await repo.confirmReceipt(makeCommand({ idempotencyKey: '__proto__' }))
    await repo.confirmReceipt(makeCommand({ idempotencyKey: 'constructor' }))

    // 原型未被替换/污染；记录为自有属性
    expect(Object.getPrototypeOf(records)).toBe(protoBefore)
    expect(Object.prototype.hasOwnProperty.call(records, '__proto__')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(records, 'constructor')).toBe(true)
    const injected = Object.getPrototypeOf(records) as Record<string, unknown>
    expect('receiptId' in injected).toBe(false)
    expect('canonicalParams' in injected).toBe(false)
    // 全局空对象不携带注入属性
    const fresh: Record<string, unknown> = {}
    expect(fresh.receiptId).toBeUndefined()
    expect(fresh.paramsHash).toBeUndefined()
  })

  it('getIdempotencyRecord/setIdempotencyRecord 自有属性语义：原型键查询恒 undefined，写入不落原型', () => {
    const records = createEmptyPrototypeState().idempotencyRecords
    // 无原型容器：任何原型键查询恒 undefined；写入不落原型（原型恒为 null）
    for (const key of PROTOTYPE_KEYS) {
      expect(getIdempotencyRecord(records, key)).toBeUndefined()
    }
    setIdempotencyRecord(records, '__proto__', {
      receiptId: 'rc-x',
      canonicalParams: 'p',
      paramsHash: 'h',
    })
    expect(getIdempotencyRecord(records, '__proto__')?.receiptId).toBe('rc-x')
    expect(Object.getPrototypeOf(records)).toBeNull()

    // Fixture 初始化的普通对象容器在 own-property 语义下同样免疫：
    // 原型键查询恒 undefined；'__proto__' 写入为自有属性、不替换原型
    const fixtureRecords = createInitialPrototypeState().idempotencyRecords
    for (const key of PROTOTYPE_KEYS) {
      expect(getIdempotencyRecord(fixtureRecords, key)).toBeUndefined()
    }
    const protoBefore = Object.getPrototypeOf(fixtureRecords)
    setIdempotencyRecord(fixtureRecords, '__proto__', {
      receiptId: 'rc-y',
      canonicalParams: 'p',
      paramsHash: 'h',
    })
    expect(getIdempotencyRecord(fixtureRecords, '__proto__')?.receiptId).toBe('rc-y')
    expect(Object.getPrototypeOf(fixtureRecords)).toBe(protoBefore)
  })
})

describe('幂等索引 — Fixture / resetDemoData 初始化语义', () => {
  it('历史演示收款单不预置幂等记录：幂等仅约束新确认操作（历史键发起新确认创建新收款单）', async () => {
    const state = createInitialPrototypeState()
    // Fixture 幂等索引零自有键
    expect(Object.keys(state.idempotencyRecords).length).toBe(0)
    expect(state.receipts.some((item) => item.idempotencyKey === 'demo-rc-001')).toBe(true)

    const repo = new MemoryPrototypeRepository(state)
    // 用历史收款单的幂等键发起新确认：不命中历史单（历史单不预置幂等记录），创建新收款单
    const created = await repo.confirmReceipt(
      makeCommand({ idempotencyKey: 'demo-rc-001', allocations: [{ receivableId: 'ar-001', allocationAmount: '100.00' }] }),
    )
    expect(created.id).not.toBe('rc-001')
    expect(state.receipts.length).toBe(9)
    // 新确认操作从此受幂等约束
    const replay = await repo.confirmReceipt(
      makeCommand({ idempotencyKey: 'demo-rc-001', allocations: [{ receivableId: 'ar-001', allocationAmount: '100.00' }] }),
    )
    expect(replay.id).toBe(created.id)
    expect(state.receipts.length).toBe(9)
  })

  it('resetDemoData 与 Fixture 初始化语义一致：幂等索引清空后同键可重新确认', async () => {
    setActivePinia(createPinia())
    const store = usePrototypeStore()
    const command = makeCommand({ idempotencyKey: 'reset-idem' })
    await store.confirmReceipt(command)
    expect(store.receipts.length).toBe(9)

    store.resetDemoData()
    expect(store.receipts.length).toBe(8)

    // 索引已清空：同键异参不再 CONFLICT（旧索引残留会拒绝），新确认正常落账
    const second = await store.confirmReceipt({
      ...command,
      actualAmount: '200.00',
      allocations: [{ receivableId: 'ar-001', allocationAmount: '200.00' }],
    })
    expect(second.actualAmount).toBe('200.00')
    expect(store.receipts.length).toBe(9)
    // 一笔收款只产生一条资金流入（新确认的流水独立且唯一）
    const txn = store.fundTransactions.find((item) => item.id === second.fundTransactionId)
    expect(txn?.direction).toBe('IN')
    expect(txn?.sourceDocId).toBe(second.id)

    // 新索引重建后幂等继续生效：同键同参返回原结果、不重复落账
    const replay = await store.confirmReceipt({
      ...command,
      actualAmount: '200.00',
      allocations: [{ receivableId: 'ar-001', allocationAmount: '200.00' }],
    })
    expect(replay.id).toBe(second.id)
    expect(store.receipts.length).toBe(9)
    expect(store.fundTransactions.length).toBe(23)
    expect(store.receiptAllocations.length).toBe(11)
  })
})
