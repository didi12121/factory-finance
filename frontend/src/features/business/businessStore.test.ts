/**
 * 业务 Store（应收/回款）真实 API 接线测试。
 *
 * 覆盖红线：
 * - 写操作携带请求幂等键（同一次操作重试复用同一键由页面保证，Store 透传）；
 * - 确认收款一次只提交一条收款单 + 核销明细（金额十进制字符串，不做 Number 运算）；
 * - 应收视图的已收/未收/状态/逾期一律取自后端派生值（不重复计算）；
 * - 失败不回退本地 Mock 数据（错误直接上抛）。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useBusinessStore } from './businessStore'
import { installMockAdapter, ok, fail } from '@/services/api/testAdapter'
import type { ReceivableRecord, ReceiptRecord } from '@/services/api'

const RECEIVABLE: ReceivableRecord = {
  id: '1',
  statementNo: 'YS-202611-0001',
  customerId: '10',
  customerName: '测试客户',
  accountingMonth: '2026-11',
  statementDate: '2026-11-01',
  dueDate: '2026-11-30',
  originalAmount: '12000.00',
  paidAmount: '7000.00',
  outstandingAmount: '5000.00',
  paymentStatus: 'PARTIALLY_PAID',
  overdue: false,
  status: 'CONFIRMED',
  remark: null,
  voidRecordId: null,
  voidNo: null,
  voidDate: null,
  createdAt: '2026-11-01T09:00:00',
  createdBy: 'admin',
}

const RECEIPT: ReceiptRecord = {
  id: '5',
  receiptNo: 'SK-202611-0001',
  customerId: '10',
  customerName: '测试客户',
  receiptDate: '2026-11-20',
  accountId: '2',
  accountName: '银行账户',
  actualAmount: '15000.00',
  fundTransactionId: '99',
  fundTransactionNo: 'SK-202611-0001-1',
  externalRef: null,
  remark: null,
  status: 'CONFIRMED',
  voidRecordId: null,
  voidNo: null,
  voidDate: null,
  allocations: [
    {
      id: '100',
      receiptId: '5',
      receiptNo: 'SK-202611-0001',
      receivableId: '1',
      statementNo: 'YS-202611-0001',
      allocationAmount: '8000.00',
      status: 'ACTIVE',
      allocatedAt: '2026-11-20T10:00:00',
    },
    {
      id: '101',
      receiptId: '5',
      receiptNo: 'SK-202611-0001',
      receivableId: '2',
      statementNo: 'YS-202611-0002',
      allocationAmount: '7000.00',
      status: 'ACTIVE',
      allocatedAt: '2026-11-20T10:00:00',
    },
  ],
  createdAt: '2026-11-20T10:00:00',
  createdBy: 'admin',
}

let restore: (() => void) | null = null

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  restore?.()
  restore = null
})

function stub(handler: Parameters<typeof installMockAdapter>[0]) {
  const installed = installMockAdapter(handler)
  restore = installed.restore
  return installed.requests
}

describe('业务 Store：加载与派生口径', () => {
  it('加载后应收视图读取后端派生值（已收/未收/状态/逾期）', async () => {
    stub((config) => {
      const url = config.url ?? ''
      if (url.includes('/receivable/receivables')) {
        return ok({ items: [RECEIVABLE], total: 1, page: 1, size: 500 })
      }
      if (url.includes('/receivable/receipts')) {
        return ok({ items: [RECEIPT], total: 1, page: 1, size: 500 })
      }
      if (url.includes('/masterdata/customers')) {
        return ok({ items: [], total: 0, page: 1, size: 500 })
      }
      return ok({ items: [], total: 0, page: 1, size: 500 })
    })
    const store = useBusinessStore()
    await store.load()

    expect(store.receivableViews).toHaveLength(1)
    expect(store.receivableViews[0]?.summary.paidAmount).toBe('7000.00')
    expect(store.receivableViews[0]?.summary.outstandingAmount).toBe('5000.00')
    expect(store.receivableViews[0]?.summary.status).toBe('PARTIALLY_PAID')
    // 有效核销明细（一笔收款两笔核销）
    expect(store.receiptAllocations).toHaveLength(2)
    // 收款单资金流水号可直接读取（不依赖本地流水副本）
    expect(store.transactionNoOfReceipt('5')).toBe('SK-202611-0001-1')
  })

  it('加载失败不回退本地数据（错误上抛且状态为空）', async () => {
    stub(() => fail(500, 'INTERNAL_ERROR', '数据库不可用'))
    const store = useBusinessStore()
    await expect(store.load()).rejects.toBeTruthy()
    expect(store.receivableViews).toHaveLength(0)
    expect(store.loadError).not.toBeNull()
  })
})

describe('业务 Store：幂等与写入载荷', () => {
  it('新建应收单透传幂等键 + 十进制金额（不建流水）', async () => {
    const requests = stub((config) => {
      if ((config.method ?? '').toLowerCase() === 'post') {
        return ok({ ...RECEIVABLE, id: '7', statementNo: 'YS-202611-0007', paidAmount: '0.00', outstandingAmount: '8000.00', paymentStatus: 'UNPAID' })
      }
      return ok({ items: [], total: 0, page: 1, size: 500 })
    })
    const store = useBusinessStore()
    await store.createReceivable({
      customerId: '10',
      accountingMonth: '2026-11',
      statementDate: '2026-11-01',
      dueDate: '2026-11-30',
      amount: '8000.00',
      remark: null,
      idempotencyKey: 'test-key-0001',
    })
    const post = requests.find((item) => item.method === 'POST')
    expect(post?.url).toContain('/receivable/receivables')
    expect(post?.body).toMatchObject({
      customerId: 10,
      accountingMonth: '2026-11',
      statementDate: '2026-11-01',
      amount: '8000.00',
      idempotencyKey: 'test-key-0001',
    })
  })

  it('确认收款提交一条收款单 + 多笔核销明细（全额核销）', async () => {
    const requests = stub((config) => {
      const url = config.url ?? ''
      if ((config.method ?? '').toLowerCase() === 'post' && url.endsWith('/receivable/receipts')) {
        return ok(RECEIPT)
      }
      if (url.includes('/receivable/receivables')) {
        return ok({ items: [RECEIVABLE], total: 1, page: 1, size: 500 })
      }
      return ok({ items: [RECEIPT], total: 1, page: 1, size: 500 })
    })
    const store = useBusinessStore()
    const receipt = await store.confirmReceipt({
      idempotencyKey: 'receipt-key-0001',
      customerId: '10',
      receiptDate: '2026-11-20',
      accountId: '2',
      actualAmount: '15000.00',
      externalRef: null,
      remark: null,
      allocations: [
        { receivableId: '1', allocationAmount: '8000.00' },
        { receivableId: '2', allocationAmount: '7000.00' },
      ],
    })

    const post = requests.find((item) => item.method === 'POST' && item.url.endsWith('/receivable/receipts'))
    expect(post?.body).toMatchObject({
      customerId: 10,
      accountId: 2,
      actualAmount: '15000.00',
      idempotencyKey: 'receipt-key-0001',
      allocations: [
        { receivableId: 1, amount: '8000.00' },
        { receivableId: 2, amount: '7000.00' },
      ],
    })
    expect(receipt.receiptNo).toBe('SK-202611-0001')
    // 一笔收款只对应一条资金流水
    expect(receipt.fundTransactionId).toBe('99')
  })

  it('核销预览错误按契约回传（未分配/超额由后端判定）', async () => {
    stub(() =>
      ok({
        allocations: [{ receivableId: 1, amount: '8000.00' }],
        totalAllocated: '8000.00',
        unallocated: '1000.00',
        errors: [{ code: 'VALIDATION_ERROR', message: '本阶段仅支持全额核销' }],
      }),
    )
    const store = useBusinessStore()
    const preview = await store.previewReceiptAllocation({
      customerId: '10',
      actualAmount: '9000.00',
      allocations: [{ receivableId: '1', allocationAmount: '8000.00' }],
    })
    expect(preview.unallocated).toBe('1000.00')
    expect(preview.validationErrors).toHaveLength(1)
    expect(preview.validationErrors[0]?.code).toBe('VALIDATION_ERROR')
  })
})
