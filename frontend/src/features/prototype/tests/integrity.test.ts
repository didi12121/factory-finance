/**
 * 派生数据完整性测试（Task A4）：
 * 超额核销异常不得静默钳制——ReceivableSummary.integrity（契约 V1.2）显式暴露
 * status='OVER_ALLOCATED' 与 overAllocatedAmount 差额；展示口径 outstanding ≥ 0
 * 与异常标记并存；原始业务事实（原始应收/实际核销合计）保留不变；
 * 写时校验（confirm 拒绝超额核销）仍是第一道防线。
 */

import { describe, expect, it } from 'vitest'
import type { Receivable } from '../contracts'
import { DEMO_TODAY } from '../contracts'
import { createInitialPrototypeState } from '../data/fixtures'
import { buildReceivableView, deriveReceivableSummary } from '../domain/receivable'
import { MemoryPrototypeRepository } from '../repository/memoryPrototypeRepository'
import { allocationOf, captureBusinessErrors, expectErrorContaining } from './helpers'

function makeReceivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: 'ar-test',
    statementNo: 'AR-TEST-0001',
    customerId: 'cust-x',
    accountingMonth: '2026-11',
    statementDate: '2026-11-01',
    dueDate: null,
    originalAmount: '100.00',
    remark: null,
    createdAt: '2026-11-01T09:00:00',
    ...overrides,
  }
}

describe('deriveReceivableSummary — 超额核销完整性诊断（integrity）', () => {
  it('正常口径：核销合计 ≤ 原始应收 → integrity OK / 0.00（未回款、部分、结清）', () => {
    const unpaid = deriveReceivableSummary(makeReceivable({ id: 'a1', originalAmount: '8000.00' }), [])
    expect(unpaid.integrity).toEqual({ status: 'OK', overAllocatedAmount: '0.00' })
    expect(unpaid.outstandingAmount).toBe('8000.00')

    const partial = deriveReceivableSummary(
      makeReceivable({ id: 'a2', originalAmount: '8000.00' }),
      [allocationOf('rc-1', 'a2', '3000.00')],
    )
    expect(partial.integrity).toEqual({ status: 'OK', overAllocatedAmount: '0.00' })
    expect(partial.status).toBe('PARTIALLY_PAID')

    const exact = deriveReceivableSummary(
      makeReceivable({ id: 'a3', originalAmount: '8000.00' }),
      [allocationOf('rc-1', 'a3', '8000.00')],
    )
    expect(exact.integrity).toEqual({ status: 'OK', overAllocatedAmount: '0.00' })
    expect(exact.status).toBe('SETTLED')
    expect(exact.outstandingAmount).toBe('0.00')
  })

  it('超额核销异常：paidAmount 保留真实合计（不截断），outstanding 展示 0.00，integrity 给出差额', () => {
    const over = deriveReceivableSummary(
      makeReceivable({ id: 'a4', originalAmount: '100.00' }),
      [allocationOf('rc-1', 'a4', '150.00')],
    )
    // 原始业务事实保留：应收 100.00（实体）/ 实际核销合计 150.00（派生保留）
    expect(over.paidAmount).toBe('150.00')
    expect(over.outstandingAmount).toBe('0.00')
    expect(over.status).toBe('SETTLED')
    expect(over.isOverdue).toBe(false)
    expect(over.asOf).toBe(DEMO_TODAY)
    // 异常显式暴露：差额 = 150.00 − 100.00
    expect(over.integrity).toEqual({ status: 'OVER_ALLOCATED', overAllocatedAmount: '50.00' })
  })

  it('多笔核销累计超额与 0.01 级差额精确（BigInt 定点，无浮点误差）', () => {
    const multi = deriveReceivableSummary(
      makeReceivable({ id: 'a5', originalAmount: '100.00' }),
      [
        allocationOf('rc-1', 'a5', '60.00'),
        allocationOf('rc-2', 'a5', '40.01'),
      ],
    )
    expect(multi.paidAmount).toBe('100.01')
    expect(multi.integrity).toEqual({ status: 'OVER_ALLOCATED', overAllocatedAmount: '0.01' })
    expect(multi.outstandingAmount).toBe('0.00')

    const tiny = deriveReceivableSummary(
      makeReceivable({ id: 'a6', originalAmount: '0.01' }),
      [allocationOf('rc-1', 'a6', '0.02')],
    )
    expect(tiny.integrity).toEqual({ status: 'OVER_ALLOCATED', overAllocatedAmount: '0.01' })
    expect(tiny.paidAmount).toBe('0.02')
  })

  it('派生值与异常标记并存：buildReceivableView 透传 integrity，不静默掩盖', () => {
    const receivable = makeReceivable({ id: 'a7', originalAmount: '500.00' })
    const view = buildReceivableView(receivable, [allocationOf('rc-1', 'a7', '520.00')])
    expect(view.summary.integrity?.status).toBe('OVER_ALLOCATED')
    expect(view.summary.integrity?.overAllocatedAmount).toBe('20.00')
    expect(view.receivable.originalAmount).toBe('500.00')
    expect(view.summary.paidAmount).toBe('520.00')
    expect(view.summary.outstandingAmount).toBe('0.00')
  })

  it('写时校验仍是第一道防线：confirm 拒绝超额核销（integrity 仅防御旁路数据）', async () => {
    const state = createInitialPrototypeState()
    const repo = new MemoryPrototypeRepository(state)
    // 直接注入异常核销（模拟迁移/旁路数据）→ 派生层诊断暴露
    state.receiptAllocations.push(allocationOf('rc-injected', 'ar-001', '9000.00'))
    const injected = await repo.getReceivableById('ar-001')
    expect(injected?.summary.integrity).toEqual({ status: 'OVER_ALLOCATED', overAllocatedAmount: '1000.00' })
    expect(injected?.summary.paidAmount).toBe('9000.00')
    expect(injected?.summary.outstandingAmount).toBe('0.00')

    // 写时校验：正常确认路径先成功（ar-002 合法），随后对已超额应收的确认被拒绝
    const ok = await repo.confirmReceipt({
      idempotencyKey: 'integrity-guard',
      customerId: 'cust-a',
      receiptDate: '2026-11-30',
      accountId: 'acct-bank',
      actualAmount: '100.00',
      externalRef: null,
      remark: null,
      allocations: [{ receivableId: 'ar-002', allocationAmount: '100.00' }],
    })
    expect(ok.actualAmount).toBe('100.00')
    const countsAfterOk = {
      receipts: state.receipts.length,
      transactions: state.fundTransactions.length,
      allocations: state.receiptAllocations.length,
    }

    // 已超额核销的 ar-001（展示未收 0.00）→ 写时校验拒绝继续核销，零状态变化
    const overErrors = await captureBusinessErrors(() =>
      repo.confirmReceipt({
        idempotencyKey: 'integrity-guard-2',
        customerId: 'cust-a',
        receiptDate: '2026-11-30',
        accountId: 'acct-bank',
        actualAmount: '100.00',
        externalRef: null,
        remark: null,
        allocations: [{ receivableId: 'ar-001', allocationAmount: '100.00' }],
      }),
    )
    expectErrorContaining(overErrors, '已收清')
    expect(state.receipts.length).toBe(countsAfterOk.receipts)
    expect(state.fundTransactions.length).toBe(countsAfterOk.transactions)
    expect(state.receiptAllocations.length).toBe(countsAfterOk.allocations)
  })
})

describe('fixtures 初始数据完整性（派生诊断恒 OK）', () => {
  it('DEMO_RECEIVABLES 全部正常口径（无超额核销），integrity 恒 OK', () => {
    const state = createInitialPrototypeState()
    for (const receivable of state.receivables) {
      const summary = deriveReceivableSummary(receivable, state.receiptAllocations)
      expect(summary.integrity).toEqual({ status: 'OK', overAllocatedAmount: '0.00' })
    }
  })
})
