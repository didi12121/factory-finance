/**
 * receiptModel 纯逻辑测试：跨页路由参数解析（预填与无效参数安全处理）、
 * 收款单行派生（compareAmounts 精确金额）、核销行排序、命令构建。
 */
import { describe, expect, it } from 'vitest'

import {
  buildAllocationDrafts,
  buildConfirmReceiptCommand,
  buildOpenReceivableRows,
  buildReceiptRowViews,
  canonicalDisplayAmount,
  parseProcessingFeeRouteQuery,
} from './receiptModel'
import { DEMO_RECEIPT_ALLOCATIONS, DEMO_RECEIPTS, createInitialPrototypeState } from '@/features/prototype/data/fixtures'
import { buildReceivableViews } from '@/features/prototype/domain/receivable'

function context(): { customers: ReturnType<typeof createInitialPrototypeState>['customers']; receivables: ReturnType<typeof buildReceivableViews> } {
  const state = createInitialPrototypeState()
  return {
    customers: state.customers,
    receivables: buildReceivableViews(state.receivables, state.receiptAllocations),
  }
}

describe('路由参数解析（契约 navigation.ts）', () => {
  it('action=create 且客户/应收单有效：预填客户与应收单，无提示', () => {
    const result = parseProcessingFeeRouteQuery(
      { action: 'create', customerId: 'cust-a', receivableId: 'ar-002' },
      context(),
    )
    expect(result.openRegistration).toBe(true)
    expect(result.prefillCustomerId).toBe('cust-a')
    expect(result.prefillReceivableId).toBe('ar-002')
    expect(result.notices).toEqual([])
  })

  it('未携带任何参数：不展开登记、无提示', () => {
    const result = parseProcessingFeeRouteQuery({}, context())
    expect(result.openRegistration).toBe(false)
    expect(result.prefillCustomerId).toBeNull()
    expect(result.prefillReceivableId).toBeNull()
    expect(result.notices).toEqual([])
  })

  it('action 非 create：不展开登记并忽略预填参数（提示）', () => {
    const result = parseProcessingFeeRouteQuery(
      { action: 'delete', customerId: 'cust-a', receivableId: 'ar-001' },
      context(),
    )
    expect(result.openRegistration).toBe(false)
    expect(result.prefillCustomerId).toBeNull()
    expect(result.prefillReceivableId).toBeNull()
    expect(result.notices.length).toBe(1)
    expect(result.notices[0]).toContain('action')
  })

  it('action 缺失但携带 customerId：忽略预填并提示', () => {
    const result = parseProcessingFeeRouteQuery({ customerId: 'cust-a' }, context())
    expect(result.openRegistration).toBe(false)
    expect(result.prefillCustomerId).toBeNull()
    expect(result.notices.length).toBe(1)
  })

  it('customerId 不存在：忽略预填并提示，应收单一并忽略（不误核销）', () => {
    const result = parseProcessingFeeRouteQuery(
      { action: 'create', customerId: 'cust-x', receivableId: 'ar-001' },
      context(),
    )
    expect(result.openRegistration).toBe(true)
    expect(result.prefillCustomerId).toBeNull()
    expect(result.prefillReceivableId).toBeNull()
    expect(result.notices.some((item) => item.includes('客户不存在'))).toBe(true)
  })

  it('customerId 已停用（示例客户 E）：忽略预填并提示', () => {
    const result = parseProcessingFeeRouteQuery(
      { action: 'create', customerId: 'cust-e', receivableId: 'ar-024' },
      context(),
    )
    expect(result.prefillCustomerId).toBeNull()
    expect(result.prefillReceivableId).toBeNull()
    expect(result.notices.some((item) => item.includes('已停用'))).toBe(true)
  })

  it('receivableId 不存在：提示并忽略应收单预填，客户仍预填', () => {
    const result = parseProcessingFeeRouteQuery(
      { action: 'create', customerId: 'cust-a', receivableId: 'ar-999' },
      context(),
    )
    expect(result.prefillCustomerId).toBe('cust-a')
    expect(result.prefillReceivableId).toBeNull()
    expect(result.notices.some((item) => item.includes('应收单不存在'))).toBe(true)
  })

  it('应收单不属于所选客户（跨客户）：忽略应收单预填并提示', () => {
    const result = parseProcessingFeeRouteQuery(
      { action: 'create', customerId: 'cust-b', receivableId: 'ar-001' },
      context(),
    )
    expect(result.prefillCustomerId).toBe('cust-b')
    expect(result.prefillReceivableId).toBeNull()
    expect(result.notices.some((item) => item.includes('不属于所选客户'))).toBe(true)
  })

  it('应收单已结清（ar-003）：忽略应收单预填并提示，不误核销', () => {
    const result = parseProcessingFeeRouteQuery(
      { action: 'create', customerId: 'cust-a', receivableId: 'ar-003' },
      context(),
    )
    expect(result.prefillCustomerId).toBe('cust-a')
    expect(result.prefillReceivableId).toBeNull()
    expect(result.notices.some((item) => item.includes('已结清'))).toBe(true)
  })

  it('仅携带 receivableId（customerId 缺省，契约允许）：按归属推断客户', () => {
    const result = parseProcessingFeeRouteQuery(
      { action: 'create', receivableId: 'ar-002' },
      context(),
    )
    expect(result.prefillCustomerId).toBe('cust-a')
    expect(result.prefillReceivableId).toBe('ar-002')
    expect(result.notices).toEqual([])
  })
})

describe('收款单行派生（金额精确）', () => {
  it('已核销/未分配由核销明细派生，状态三态正确', () => {
    const state = createInitialPrototypeState()
    const rows = buildReceiptRowViews(state.receipts, state.receiptAllocations, state.customers, state.fundAccounts)
    const rc001 = rows.find((row) => row.receipt.id === 'rc-001')
    expect(rc001?.allocatedAmount).toBe('6500.00')
    expect(rc001?.unallocatedAmount).toBe('0.00')
    expect(rc001?.allocationStatus).toBe('FULL')
    expect(rc001?.statusLabel).toBe('已全额核销')
  })

  it('0.01 级金额精确派生（rc-007：12,345.66 全额核销）', () => {
    const state = createInitialPrototypeState()
    const rows = buildReceiptRowViews(state.receipts, state.receiptAllocations, state.customers, state.fundAccounts)
    const rc007 = rows.find((row) => row.receipt.id === 'rc-007')
    expect(rc007?.allocatedAmount).toBe('12345.66')
    expect(rc007?.unallocatedAmount).toBe('0.00')
  })

  it('无核销明细：未核销且未分配 = 实际收款', () => {
    const state = createInitialPrototypeState()
    const rows = buildReceiptRowViews(
      [{ ...state.receipts[0]!, id: 'rc-x', actualAmount: '1234.55' }],
      [],
      state.customers,
      state.fundAccounts,
    )
    expect(rows[0]?.allocatedAmount).toBe('0.00')
    expect(rows[0]?.unallocatedAmount).toBe('1234.55')
    expect(rows[0]?.allocationStatus).toBe('UNALLOCATED')
    expect(rows[0]?.statusKind).toBe('muted')
  })

  it('部分核销状态派生（2,000.00 收款核销 500.01）', () => {
    const state = createInitialPrototypeState()
    const rows = buildReceiptRowViews(
      [{ ...state.receipts[0]!, id: 'rc-x', actualAmount: '2000.00' }],
      [{ id: 'a', receiptId: 'rc-x', receivableId: 'ar-001', allocationAmount: '500.01', allocatedAt: 't' }],
      state.customers,
      state.fundAccounts,
    )
    expect(rows[0]?.allocatedAmount).toBe('500.01')
    expect(rows[0]?.unallocatedAmount).toBe('1499.99')
    expect(rows[0]?.allocationStatus).toBe('PARTIAL')
    expect(rows[0]?.statusKind).toBe('warning')
  })

  it('收款单/核销明细基线数据完整（fixtures 引用未被改动）', () => {
    expect(DEMO_RECEIPTS).toHaveLength(8)
    expect(DEMO_RECEIPT_ALLOCATIONS).toHaveLength(10)
  })
})

describe('核销分配表行（未结清 + 紧迫度排序）', () => {
  it('仅保留未结清应收单，按到期日先后排序（无到期日排最后）', () => {
    const ctx = context()
    const rows = buildOpenReceivableRows(ctx.receivables.filter((v) => v.receivable.customerId === 'cust-b'))
    // ar-004(2026-11-20) → ar-005(2026-11-30) → ar-018(2026-12-30) → ar-021(无到期日)
    expect(rows.map((row) => row.receivableId)).toEqual(['ar-004', 'ar-005', 'ar-018', 'ar-021'])
    // ar-004：原始 20,000.00 已收 12,000.00 未收 8,000.00
    expect(rows[0]?.originalAmount).toBe('20000.00')
    expect(rows[0]?.paidAmount).toBe('12000.00')
    expect(rows[0]?.outstandingAmount).toBe('8000.00')
  })

  it('已结清应收单不进入核销分配表', () => {
    const ctx = context()
    const rows = buildOpenReceivableRows(ctx.receivables.filter((v) => v.receivable.customerId === 'cust-a'))
    expect(rows.map((row) => row.receivableId)).toEqual(['ar-001', 'ar-002'])
    expect(rows.some((row) => row.receivableId === 'ar-003')).toBe(false)
  })
})

describe('命令构建（核销草稿 → 契约命令）', () => {
  it('空输入跳过；非空输入保留（非法/零值交由 Store 拒绝）', () => {
    const drafts = buildAllocationDrafts({ 'ar-001': '8000.00', 'ar-002': '', 'ar-003': ' 0 ' })
    expect(drafts).toEqual([
      { receivableId: 'ar-001', allocationAmount: '8000.00' },
      { receivableId: 'ar-003', allocationAmount: '0' },
    ])
  })

  it('空串外部参考号/备注归一化为 null', () => {
    const command = buildConfirmReceiptCommand({
      idempotencyKey: 'key-1',
      customerId: 'cust-a',
      receiptDate: '2026-11-30',
      accountId: 'acct-bank',
      actualAmount: '15000.00',
      externalRef: '  ',
      remark: '',
      amounts: { 'ar-001': '8000.00', 'ar-002': '7000.00' },
    })
    expect(command.externalRef).toBeNull()
    expect(command.remark).toBeNull()
    expect(command.allocations).toHaveLength(2)
    expect(command.idempotencyKey).toBe('key-1')
  })

  it('canonicalDisplayAmount 归一化两位小数，非法返回 null', () => {
    expect(canonicalDisplayAmount('15000')).toBe('15000.00')
    expect(canonicalDisplayAmount('0.1')).toBe('0.10')
    expect(canonicalDisplayAmount('1.234')).toBeNull()
  })
})
