import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import WorkbenchView from './WorkbenchView.vue'
import { ok, installMockAdapter } from '@/services/api/testAdapter'
import type { DashboardSummary, FundTransaction } from '@/services/api'
import { addDays, endOfMonth, startOfMonth, todayLocalDate } from '@/utils/localDate'

const txn: FundTransaction = {
  id: 't-1',
  transactionNo: 'FT-001',
  transactionType: 'SHAREHOLDER_CONTRIBUTION',
  tradeDate: '2026-11-25',
  accountId: 'acct-1',
  direction: 'IN',
  amount: '1850.39',
  counterparty: '张三',
  sourceDocType: 'CONTRIBUTION',
  sourceDocId: 'c-1',
  transferGroupId: null,
  status: 'RECORDED',
  remark: null,
  createdAt: '2026-11-25T10:00:00',
  voidedAt: null,
}

const summary: DashboardSummary = {
  asOf: '2026-11-27',
  period: { from: '2026-11-01', to: '2026-11-30' },
  totalFundBalance: '123456.78',
  periodContribution: '50000.00',
  periodInflow: '80000.50',
  periodActualExpenses: '23456.78',
  expenseBreakdown: [{ category: 'SALARY', amount: '20000.00' }],
  cashFlowTrend: [{ date: '2026-11-25', inflow: '1850.39', outflow: '0' }],
  recentTransactions: [txn],
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/workbench', component: WorkbenchView },
      { path: '/treasury/transactions', component: { template: '<div>fundflow</div>' } },
    ],
  })
}

async function mountWorkbench() {
  const router = createTestRouter()
  await router.push('/workbench')
  await router.isReady()
  const wrapper = mount(WorkbenchView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { router, wrapper }
}

describe('经营概览页（真实 API）', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('加载概览统计并展示真实金额（千分位格式化）', async () => {
    const mock = installMockAdapter(() => ok(summary))
    restore = mock.restore
    const { wrapper } = await mountWorkbench()

    // 请求参数：默认本月（相对真实今天）
    const today = todayLocalDate()
    expect(mock.requests[0]?.url).toBe('/treasury/dashboard/summary')
    expect(mock.requests[0]?.params).toEqual({ from: startOfMonth(today), to: endOfMonth(today) })

    // 指标金额（展示层格式化）
    expect(wrapper.text()).toContain('123,456.78')
    expect(wrapper.text()).toContain('50,000.00')
    expect(wrapper.text()).toContain('80,000.50')
    expect(wrapper.text()).toContain('23,456.78')

    // 应收区域「待开通」，不显假数字
    expect(wrapper.text()).toContain('待开通')
    expect(wrapper.text()).toContain('当前应收余额')

    // 不标注净利润
    expect(wrapper.text()).not.toContain('净利润')

    // 近期流水（带符号金额）
    expect(wrapper.find('[data-testid="recent-transactions"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="recent-transaction-amount"]').text()).toBe('+1,850.39')

    wrapper.unmount()
  })

  it('切换统计期间重新请求（最近 30 天）', async () => {
    const mock = installMockAdapter(() => ok(summary))
    restore = mock.restore
    const { wrapper } = await mountWorkbench()

    await wrapper.find('[data-testid="date-preset-last30Days"]').trigger('click')
    await flushPromises()

    const today = todayLocalDate()
    expect(mock.requests.length).toBe(2)
    expect(mock.requests[1]?.params).toEqual({ from: addDays(today, -29), to: today })

    wrapper.unmount()
  })

  it('加载失败展示错误并支持重试（禁止回退演示数据）', async () => {
    let call = 0
    const mock = installMockAdapter(() => {
      call += 1
      return call === 1
        ? { status: 500, data: { code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null, traceId: 't' } }
        : ok(summary)
    })
    restore = mock.restore
    const { wrapper } = await mountWorkbench()

    expect(wrapper.text()).toContain('服务器内部错误')
    expect(wrapper.text()).not.toContain('123,456.78')

    await wrapper.find('[data-testid="workbench-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('123,456.78')
    wrapper.unmount()
  })
})
