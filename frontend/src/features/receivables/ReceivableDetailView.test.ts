/**
 * 应收单详情页组件测试 —— Agent F（P02-F）。
 *
 * 真实挂载（Pinia + 内存路由），覆盖：
 * 详情数据与列表一致（单一数据源）、收款单实际总额 vs 本单核销金额区分
 * （一笔收款核销多单时不得把收款单总额当作本单已收）、核销明细与操作历史、
 * 登记回款跳转（冻结契约）、无效 ID 未找到状态 + 返回列表、无回款记录空状态。
 */

import { afterEach, describe, expect, it } from 'vitest'

import ReceivableDetailView from './ReceivableDetailView.vue'
import {
  bodyText,
  cleanupMounted,
  findButton,
  flushPromises,
  mountView,
  q,
  type MountedView,
} from './testSupport'

let mounted: MountedView | null = null

function afterEachCleanup(): void {
  if (mounted !== null) {
    cleanupMounted(mounted)
    mounted = null
  }
}

// 无论断言是否通过都清理挂载，避免 Portal/页面 DOM 跨测试串扰
afterEach(() => {
  afterEachCleanup()
})

describe('ReceivableDetailView — 详情数据（store 派生，单一数据源）', () => {
  it('ar-004：编号/客户/月份/状态/逾期 + 应收 20,000.00 / 已收 12,000.00 / 未收 8,000.00', async () => {
    mounted = await mountView(ReceivableDetailView, '/business/receivables/ar-004')
    const text = bodyText()
    expect(text).toContain('AR-2026-0004')
    expect(text).toContain('示例客户 B')
    expect(text).toContain('2026-09')
    expect(text).toContain('部分回款')
    expect(text).toContain('逾期')
    expect(text).toContain('20,000.00')
    expect(text).toContain('12,000.00')
    expect(text).toContain('8,000.00')
    expect(text).toContain('多次回款核销演示')
    afterEachCleanup()
  })

  it('收款单实际总额与本单核销金额严格区分（rc-003 总额 5,000.00 / 本单核销 4,000.00）', async () => {
    mounted = await mountView(ReceivableDetailView, '/business/receivables/ar-004')
    const receiptSection = q('[data-testid="receipt-records"]')
    if (receiptSection === null) {
      throw new Error('未找到回款记录区块')
    }
    const text = receiptSection.textContent ?? ''

    // rc-002：总额 8,000.00 全额核销本单
    expect(text).toContain('SK-2026-0002')
    expect(text).toContain('8,000.00')
    // rc-003：实际总额 5,000.00（另核销 ar-008 的 1,000.00），本单核销仅 4,000.00
    expect(text).toContain('SK-2026-0003')
    expect(text).toContain('5,000.00')
    expect(text).toContain('4,000.00')
    // 不得出现「收款单总额之和」被当作本单已收的数字
    expect(text).not.toContain('13,000.00')
    expect(text).not.toContain('15,000.00')

    // 本单已收 = Σ 本单核销 = 12,000.00（而非 8,000 + 5,000 = 13,000.00）
    const summary = q('[data-testid="detail-summary"]')
    expect(summary?.textContent ?? '').toContain('12,000.00')
    expect(summary?.textContent ?? '').not.toContain('13,000.00')
    // 区分说明必须存在
    expect(text).toContain('收款单实际总额')
    expect(text).toContain('本单核销金额')
    afterEachCleanup()
  })

  it('核销明细逐笔展示，操作历史含创建与核销事件', async () => {
    mounted = await mountView(ReceivableDetailView, '/business/receivables/ar-004')
    const allocations = q('[data-testid="allocation-details"]')
    const allocationText = allocations?.textContent ?? ''
    expect(allocationText).toContain('alloc-002')
    expect(allocationText).toContain('alloc-003')
    expect(allocationText).toContain('8,000.00')
    expect(allocationText).toContain('4,000.00')
    expect(allocationText).toContain('2026-11-05T10:05:00')
    expect(allocationText).toContain('2026-11-18T10:05:00')

    const text = bodyText()
    expect(text).toContain('操作历史')
    expect(text).toContain('创建应收单')
    expect(text).toContain('核销 8000.00（收款单 SK-2026-0002）')
    expect(text).toContain('核销 4000.00（收款单 SK-2026-0003）')
    afterEachCleanup()
  })

  it('无回款单据展示空状态（不伪造数据）', async () => {
    mounted = await mountView(ReceivableDetailView, '/business/receivables/ar-001')
    expect(bodyText()).toContain('AR-2026-0001')
    expect(bodyText()).toContain('暂无回款记录')
    expect(bodyText()).toContain('暂无核销明细')
    // 未回款状态与 0.00 已收
    expect(bodyText()).toContain('未回款')
    expect(bodyText()).toContain('0.00')
    afterEachCleanup()
  })
})

describe('ReceivableDetailView — 登记回款入口（冻结契约）', () => {
  it('登记回款跳转 /business/processing-fee?action=create&customerId&receivableId', async () => {
    mounted = await mountView(ReceivableDetailView, '/business/receivables/ar-004')
    const button = findButton('登记回款')
    if (button === null) {
      throw new Error('未找到登记回款按钮')
    }
    button.click()
    await flushPromises()
    expect(mounted.router.currentRoute.value.fullPath).toBe(
      '/business/processing-fee?action=create&customerId=cust-b&receivableId=ar-004',
    )
    afterEachCleanup()
  })
})

describe('ReceivableDetailView — 无效 ID', () => {
  it('展示明确未找到状态并可返回列表（不空白、不造假单）', async () => {
    mounted = await mountView(ReceivableDetailView, '/business/receivables/ar-999')
    const text = bodyText()
    expect(text).toContain('未找到该应收单')
    expect(text).toContain('ar-999')
    // 不得渲染任何伪造金额区块
    expect(q('[data-testid="detail-summary"]')).toBeNull()
    expect(q('[data-testid="receipt-records"]')).toBeNull()

    const back = findButton('返回应收账款列表')
    if (back === null) {
      throw new Error('未找到返回按钮')
    }
    back.click()
    await flushPromises()
    expect(mounted.router.currentRoute.value.fullPath).toBe('/business/receivables')
    afterEachCleanup()
  })
})
