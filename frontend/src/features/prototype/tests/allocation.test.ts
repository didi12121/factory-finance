/**
 * 回款核销规则测试：校验矩阵、预览计算、自动分配优先级（只预览不落状态）。
 */

import { describe, expect, it } from 'vitest'
import type {
  ConfirmReceiptCommand,
  ReceiptAllocationDraft,
  Receivable,
} from '../contracts'
import {
  autoAllocateReceipt,
  previewReceiptAllocation,
  validateReceiptAllocation,
  type AllocationContext,
} from '../domain/allocation'
import { createInitialPrototypeState } from '../data/fixtures'
import { allocationOf, expectErrorContaining } from './helpers'

function makeContext(overrides: Partial<AllocationContext> = {}): AllocationContext {
  return {
    customers: [{ id: 'cust-a', name: '示例客户 A', status: 'ENABLED' }],
    fundAccounts: [
      { id: 'acct-bank', name: '示例银行账户', accountType: 'BANK', openingBalance: '0.00', enabled: true },
      { id: 'acct-off', name: '示例停用账户', accountType: 'ALIPAY', openingBalance: '0.00', enabled: false },
    ],
    receivables: [],
    receiptAllocations: [],
    ...overrides,
  }
}

function fixtureContext(): AllocationContext {
  const state = createInitialPrototypeState()
  return {
    customers: state.customers,
    fundAccounts: state.fundAccounts,
    receivables: state.receivables,
    receiptAllocations: state.receiptAllocations,
  }
}

function makeConfirmCommand(overrides: Partial<ConfirmReceiptCommand> = {}): ConfirmReceiptCommand {
  return {
    idempotencyKey: 'test-key-1',
    customerId: 'cust-a',
    receiptDate: '2026-11-30',
    accountId: 'acct-bank',
    actualAmount: '100.00',
    externalRef: null,
    remark: null,
    allocations: [],
    ...overrides,
  }
}

function makeReceivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: 'ar-1',
    statementNo: 'AR-TEST-0001',
    customerId: 'cust-a',
    accountingMonth: '2026-11',
    statementDate: '2026-11-01',
    dueDate: null,
    originalAmount: '100.00',
    remark: null,
    createdAt: '2026-11-01T09:00:00',
    ...overrides,
  }
}

describe('validateReceiptAllocation', () => {
  it('合法核销方案：无错误（实际收款 = 核销总额）', () => {
    const context = makeContext({ receivables: [makeReceivable()] })
    const errors = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '100.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '100.00' }],
      }),
      context,
    )
    expect(errors).toEqual([])
  })

  it('非法金额拒绝：实际收款格式非法 / 非正 / 超精度', () => {
    const context = makeContext({ receivables: [makeReceivable()] })
    for (const actualAmount of ['abc', '0', '-5.00', '100.005', '']) {
      const errors = validateReceiptAllocation(
        makeConfirmCommand({
          actualAmount,
          allocations: [{ receivableId: 'ar-1', allocationAmount: '1.00' }],
        }),
        context,
      )
      expect(errors.length).toBeGreaterThan(0)
    }
    const zeroErrors = validateReceiptAllocation(
      makeConfirmCommand({ actualAmount: '0.00' }),
      context,
    )
    expectErrorContaining(zeroErrors, '实际收款金额必须大于 0')
  })

  it('每条核销金额必须大于 0 且格式合法', () => {
    const context = makeContext({ receivables: [makeReceivable({ originalAmount: '200.00' })] })
    const zeroDraft = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '100.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '0' }],
      }),
      context,
    )
    expectErrorContaining(zeroDraft, '核销金额必须大于 0')
    const badFormat = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '100.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: 'x.00' }],
      }),
      context,
    )
    expectErrorContaining(badFormat, '核销金额格式非法')
  })

  it('核销总额超过实际收款金额拒绝', () => {
    const context = makeContext({ receivables: [makeReceivable({ originalAmount: '500.00' })] })
    const errors = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '100.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '120.00' }],
      }),
      context,
    )
    expectErrorContaining(errors, '核销总额超过实际收款金额')
  })

  it('单张累计核销（已有核销 + 本次）超过原始应收拒绝', () => {
    const receivable = makeReceivable({ originalAmount: '8000.00' })
    const context = makeContext({
      receivables: [receivable],
      receiptAllocations: [allocationOf('rc-old', 'ar-1', '6000.00')],
    })
    const errors = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '3000.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '3000.00' }],
      }),
      context,
    )
    expectErrorContaining(errors, '累计核销金额超过应收单原始金额')
  })

  it('跨客户核销拒绝', () => {
    const context = makeContext({
      receivables: [makeReceivable({ customerId: 'cust-b' })],
    })
    const errors = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '100.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '100.00' }],
      }),
      context,
    )
    expectErrorContaining(errors, '不允许跨客户核销')
  })

  it('重复核销项拒绝（同一应收单重复分配）', () => {
    const context = makeContext({ receivables: [makeReceivable({ originalAmount: '200.00' })] })
    const allocations: ReceiptAllocationDraft[] = [
      { receivableId: 'ar-1', allocationAmount: '50.00' },
      { receivableId: 'ar-1', allocationAmount: '50.00' },
    ]
    const errors = validateReceiptAllocation(
      makeConfirmCommand({ actualAmount: '100.00', allocations }),
      context,
    )
    expectErrorContaining(errors, '重复的应收单')
  })

  it('应收单不存在 / 已收清拒绝', () => {
    const context = makeContext({
      receivables: [makeReceivable({ originalAmount: '100.00' })],
      receiptAllocations: [allocationOf('rc-old', 'ar-1', '100.00')],
    })
    const missing = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '50.00',
        allocations: [{ receivableId: 'ar-none', allocationAmount: '50.00' }],
      }),
      context,
    )
    expectErrorContaining(missing, '应收单不存在')
    const settled = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '50.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '50.00' }],
      }),
      context,
    )
    expectErrorContaining(settled, '已收清')
  })

  it('无效账户拒绝：账户不存在 / 账户停用', () => {
    const context = makeContext({ receivables: [makeReceivable()] })
    const plan: ReceiptAllocationDraft[] = [{ receivableId: 'ar-1', allocationAmount: '100.00' }]
    const missing = validateReceiptAllocation(
      makeConfirmCommand({ accountId: 'acct-none', actualAmount: '100.00', allocations: plan }),
      context,
    )
    expectErrorContaining(missing, '资金账户不存在')
    const disabled = validateReceiptAllocation(
      makeConfirmCommand({ accountId: 'acct-off', actualAmount: '100.00', allocations: plan }),
      context,
    )
    expectErrorContaining(disabled, '资金账户已停用')
  })

  it('未分配金额不能确认：Σ核销 < 实收 → 校验错误（预收款规则 Phase 2 前禁止）', () => {
    const context = makeContext({ receivables: [makeReceivable({ originalAmount: '500.00' })] })
    const errors = validateReceiptAllocation(
      makeConfirmCommand({
        actualAmount: '100.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '80.00' }],
      }),
      context,
    )
    expectErrorContaining(errors, '存在未分配金额 20.00')
    const emptyDrafts = validateReceiptAllocation(
      makeConfirmCommand({ actualAmount: '100.00', allocations: [] }),
      context,
    )
    expectErrorContaining(emptyDrafts, '存在未分配金额 100.00')
  })

  it('幂等键不能为空', () => {
    const context = makeContext({ receivables: [makeReceivable()] })
    const errors = validateReceiptAllocation(
      makeConfirmCommand({
        idempotencyKey: '   ',
        actualAmount: '100.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '100.00' }],
      }),
      context,
    )
    expectErrorContaining(errors, '幂等键不能为空')
  })
})

describe('previewReceiptAllocation', () => {
  it('手动草稿预览：已分配 / 未分配 / 校验错误分离（0.01 元级精确）', () => {
    const context = makeContext({
      receivables: [
        makeReceivable({ id: 'ar-1', originalAmount: '0.01' }),
        makeReceivable({ id: 'ar-2', originalAmount: '1850.39' }),
      ],
    })
    const preview = previewReceiptAllocation(
      {
        customerId: 'cust-a',
        actualAmount: '1850.40',
        allocations: [
          { receivableId: 'ar-1', allocationAmount: '0.01' },
          { receivableId: 'ar-2', allocationAmount: '1850.39' },
        ],
      },
      context,
    )
    expect(preview.totalAllocated).toBe('1850.40')
    expect(preview.unallocated).toBe('0.00')
    expect(preview.validationErrors).toEqual([])
    expect(preview.allocations).toEqual([
      { receivableId: 'ar-1', allocationAmount: '0.01' },
      { receivableId: 'ar-2', allocationAmount: '1850.39' },
    ])
  })

  it('未分配金额仅提示并阻止确认：预览展示 unallocated 且携带校验错误', () => {
    const context = makeContext({ receivables: [makeReceivable({ originalAmount: '500.00' })] })
    const preview = previewReceiptAllocation(
      {
        customerId: 'cust-a',
        actualAmount: '100.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '60.00' }],
      },
      context,
    )
    expect(preview.totalAllocated).toBe('60.00')
    expect(preview.unallocated).toBe('40.00')
    expect(preview.validationErrors.length).toBe(1)
    expectErrorContaining(preview.validationErrors, '存在未分配金额 40.00')
  })

  it('超额分配：unallocated 恒 ≥ 0（取 0.00）并携带超额错误', () => {
    const context = makeContext({ receivables: [makeReceivable({ originalAmount: '500.00' })] })
    const preview = previewReceiptAllocation(
      {
        customerId: 'cust-a',
        actualAmount: '50.00',
        allocations: [{ receivableId: 'ar-1', allocationAmount: '80.00' }],
      },
      context,
    )
    expect(preview.unallocated).toBe('0.00')
    expectErrorContaining(preview.validationErrors, '核销总额超过实际收款金额')
  })
})

describe('autoAllocateReceipt', () => {
  it('自动分配优先级：dueDate 较早 → statementDate 较早 → id，无 dueDate 在后（演示数据 cust-c）', () => {
    const context = fixtureContext()
    const preview = autoAllocateReceipt({ customerId: 'cust-c', actualAmount: '10.00' }, context)
    // cust-c 未结清应收到期顺序：ar-010(10-15) → ar-009(10-31) → ar-013(12-10) → ar-022(12-15) → ar-012(12-31) → ar-011(无到期日)
    expect(preview.allocations).toEqual([
      { receivableId: 'ar-010', allocationAmount: '0.01' },
      { receivableId: 'ar-009', allocationAmount: '9.99' },
    ])
    expect(preview.totalAllocated).toBe('10.00')
    expect(preview.unallocated).toBe('0.00')
    expect(preview.validationErrors).toEqual([])
  })

  it('自动分配按未收金额足额截断；跨模块场景金额（cust-a 15,000 → 8,000 + 7,000）', () => {
    const context = fixtureContext()
    const preview = autoAllocateReceipt({ customerId: 'cust-a', actualAmount: '15000.00' }, context)
    expect(preview.allocations).toEqual([
      { receivableId: 'ar-001', allocationAmount: '8000.00' },
      { receivableId: 'ar-002', allocationAmount: '7000.00' },
    ])
    expect(preview.unallocated).toBe('0.00')
  })

  it('自动分配排序细节：同 dueDate 按 statementDate、再按 id 稳定排序', () => {
    const context = makeContext({
      receivables: [
        makeReceivable({ id: 'ar-b', statementNo: 'B', dueDate: '2026-12-15', statementDate: '2026-11-01', originalAmount: '10.00' }),
        makeReceivable({ id: 'ar-c', statementNo: 'C', dueDate: '2026-12-15', statementDate: '2026-11-01', originalAmount: '10.00' }),
        makeReceivable({ id: 'ar-a', statementNo: 'A', dueDate: '2026-12-15', statementDate: '2026-10-01', originalAmount: '10.00' }),
        makeReceivable({ id: 'ar-d', statementNo: 'D', dueDate: null, statementDate: '2026-09-01', originalAmount: '10.00' }),
      ],
    })
    const preview = autoAllocateReceipt({ customerId: 'cust-a', actualAmount: '40.00' }, context)
    expect(preview.allocations.map((item) => item.receivableId)).toEqual([
      'ar-a', 'ar-b', 'ar-c', 'ar-d',
    ])
  })

  it('自动分配只预览不落状态；金额非法/客户无效返回校验错误', () => {
    const context = fixtureContext()
    const before = context.receiptAllocations.length
    const preview = autoAllocateReceipt({ customerId: 'cust-c', actualAmount: '10.00' }, context)
    expect(context.receiptAllocations.length).toBe(before)
    expect(preview.allocations.length).toBe(2)

    const badAmount = autoAllocateReceipt({ customerId: 'cust-c', actualAmount: 'abc' }, context)
    expect(badAmount.allocations).toEqual([])
    expect(badAmount.validationErrors.length).toBeGreaterThan(0)

    const badCustomer = autoAllocateReceipt({ customerId: 'cust-none', actualAmount: '10.00' }, context)
    expect(badCustomer.validationErrors.length).toBeGreaterThan(0)
    expectErrorContaining(badCustomer.validationErrors, '客户不存在')

    const disabledCustomer = autoAllocateReceipt({ customerId: 'cust-e', actualAmount: '10.00' }, context)
    expectErrorContaining(disabledCustomer.validationErrors, '客户已停用')
  })
})
