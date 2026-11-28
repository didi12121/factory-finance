/**
 * 应收列表页（真实 API 接线）组件测试。
 *
 * 覆盖：后端派生指标渲染、列表行与状态/逾期标识、行内「登记回款」跳转参数、
 * 加载失败错误态与重试。
 */

import { afterEach, describe, expect, it } from 'vitest'

import type { ReceivableRecord } from '@/services/api'
import { fail, installMockAdapter, ok } from '@/services/api/testAdapter'
import { buildProcessingFeeCreatePath } from '@/features/prototype/contracts'
import ReceivablesView from './ReceivablesView.vue'
import {
  bodyText,
  cleanupMounted,
  countRows,
  findButton,
  flushPromises,
  mountView,
  q,
  qa,
  type MountedView,
} from './testSupport'

let mounted: MountedView | null = null
let restore: (() => void) | null = null

function receivable(overrides: Partial<ReceivableRecord> = {}): ReceivableRecord {
  return {
    id: '1',
    statementNo: 'YS-202611-0001',
    customerId: '10',
    customerName: '测试客户甲',
    accountingMonth: '2026-11',
    statementDate: '2026-11-01',
    dueDate: '2026-11-30',
    originalAmount: '12000.00',
    paidAmount: '7000.00',
    outstandingAmount: '5000.00',
    paymentStatus: 'PARTIALLY_PAID',
    overdue: true,
    status: 'CONFIRMED',
    remark: null,
    voidRecordId: null,
    voidNo: null,
    voidDate: null,
    createdAt: '2026-11-01T09:00:00',
    createdBy: 'admin',
    ...overrides,
  }
}

function stubPage(items: ReceivableRecord[]): void {
  const adapter = installMockAdapter((config) => {
    const url = config.url ?? ''
    if (url.includes('/receivable/receivables')) {
      return ok({ items, total: items.length, page: 1, size: 500 })
    }
    if (url.includes('/receivable/receipts')) {
      return ok({ items: [], total: 0, page: 1, size: 500 })
    }
    if (url.includes('/masterdata/customers')) {
      const customers = Array.from(
        new Map(items.map((item) => [item.customerId, item.customerName ?? item.customerId])).entries(),
      ).map(([id, name]) => ({ id, customerNo: `CUS-${id}`, name, contact: null, phone: null, address: null, status: 'ENABLED', remark: null, createdAt: '2026-11-01T00:00:00' }))
      return ok({ items: customers, total: customers.length, page: 1, size: 500 })
    }
    return ok({ items: [], total: 0, page: 1, size: 500 })
  })
  restore = adapter.restore
}

async function setup(): Promise<void> {
  mounted = await mountView(ReceivablesView)
}

afterEach(() => {
  if (mounted !== null) {
    cleanupMounted(mounted)
    mounted = null
  }
  restore?.()
  restore = null
})

describe('应收账款列表页（真实 API）', () => {
  it('渲染页面标题与后端派生财务指标', async () => {
    stubPage([
      receivable(),
      receivable({
        id: '2',
        statementNo: 'YS-202611-0002',
        customerId: '11',
        customerName: '测试客户乙',
        originalAmount: '8000.00',
        paidAmount: '0.00',
        outstandingAmount: '8000.00',
        paymentStatus: 'UNPAID',
        overdue: false,
      }),
    ])
    await setup()

    expect(q('[data-testid="receivables-page"]')).not.toBeNull()
    const text = bodyText()
    expect(text).toContain('应收账款')
    // 累计应收 20,000.00 / 已核销 7,000.00 / 未收 13,000.00 / 逾期未收 5,000.00
    expect(text).toContain('20,000.00')
    expect(text).toContain('7,000.00')
    expect(text).toContain('13,000.00')
    expect(text).toContain('5,000.00')
  })

  it('列表展示单据、客户、回款状态与独立逾期标识', async () => {
    stubPage([receivable()])
    await setup()

    expect(countRows('receivables-table')).toBe(1)
    const text = bodyText()
    expect(text).toContain('YS-202611-0001')
    expect(text).toContain('测试客户甲')
    expect(text).toContain('部分回款')
    expect(text).toContain('逾期')
  })

  it('行内「登记回款」跳转到回款流程（action/customerId/receivableId）', async () => {
    stubPage([receivable()])
    await setup()

    const buttons = qa('[data-testid="row-register-payment"]')
    expect(buttons.length).toBe(1)
    buttons[0]?.click()
    await flushPromises()

    const expected = buildProcessingFeeCreatePath({ customerId: '10', receivableId: '1' })
    expect(mounted?.router.currentRoute.value.fullPath).toBe(expected)
  })

  it('加载失败展示错误态与重试按钮，不回退演示数据', async () => {
    const adapter = installMockAdapter(() => fail(500, 'INTERNAL_ERROR', '数据库不可用'))
    restore = adapter.restore
    await setup()

    expect(bodyText()).toContain('应收数据加载失败')
    expect(findButton('重试')).not.toBeNull()
    expect(countRows('receivables-table')).toBe(0)
  })
})
