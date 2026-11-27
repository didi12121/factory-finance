/**
 * 经营概览组件交互：点击跳转构造 + 日期筛选真实改变。
 */

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DashboardPeriod } from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import FinancialOverview from '../components/FinancialOverview.vue'
import PendingReceivables from '../components/PendingReceivables.vue'
import RecentTransactions from '../components/RecentTransactions.vue'
import { defaultDashboardFilter } from '../period'

const NOV: DashboardPeriod = { from: '2026-11-01', to: '2026-11-30' }

const Dummy = { template: '<div />' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/business/receivables', component: Dummy },
      { path: '/business/receivables/:id', component: Dummy },
      { path: '/treasury/transactions', component: Dummy },
      { path: '/business/processing-fee', component: Dummy },
      { path: '/:pathMatch(.*)*', component: Dummy },
    ],
  })
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('经营概览组件 — 点击跳转路由构造', () => {
  let store: ReturnType<typeof usePrototypeStore>
  let summary: Awaited<ReturnType<typeof store.getDashboardSummary>>

  beforeEach(async () => {
    setActivePinia(createPinia())
    store = usePrototypeStore()
    summary = await store.getDashboardSummary(NOV)
  })

  it('点击「当前应收余额」→ /business/receivables', async () => {
    const router = makeRouter()
    const wrapper = mount(FinancialOverview, {
      props: { summary },
      global: { plugins: [router, createPinia()] },
    })
    await router.push('/workbench')
    await wrapper.get('[data-testid="metric-receivables-link"]').trigger('click')
    await flush()
    expect(router.currentRoute.value.path).toBe('/business/receivables')
  })

  it('点击待收单据 → /business/receivables/:id', async () => {
    const router = makeRouter()
    const wrapper = mount(PendingReceivables, {
      props: { receivables: summary.pendingReceivables },
      global: { plugins: [router, createPinia()] },
    })
    await router.push('/workbench')
    const firstId = summary.pendingReceivables[0]?.receivable.id
    expect(firstId).toBeTruthy()
    await wrapper.get('[data-testid="pending-receivable-row"]').trigger('click')
    await flush()
    expect(router.currentRoute.value.path).toBe(`/business/receivables/${firstId}`)
  })

  it('点击近期流水 → /treasury/transactions', async () => {
    const router = makeRouter()
    const wrapper = mount(RecentTransactions, {
      props: { transactions: summary.recentTransactions },
      global: { plugins: [router, createPinia()] },
    })
    await router.push('/workbench')
    await wrapper.get('[data-testid="recent-transaction-row"]').trigger('click')
    await flush()
    expect(router.currentRoute.value.path).toBe('/treasury/transactions')
  })
})

describe('日期筛选真实改变统计期间', () => {
  it('切换预设会更新 filter（进而改变统计期间）', async () => {
    const wrapper = mount(DateRangeFilter, { props: { modelValue: defaultDashboardFilter() } })
    await wrapper.get('[data-testid="date-preset-lastMonth"]').trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted?.[0]?.[0]).toMatchObject({ preset: 'lastMonth' })
  })

  it('自定义日期输入会更新 filter 并切到自定义', async () => {
    const wrapper = mount(DateRangeFilter, { props: { modelValue: defaultDashboardFilter() } })
    // 自定义输入仅在 preset=custom 时显示，先切到 custom
    expect(wrapper.find('[data-testid="date-custom-from"]').exists()).toBe(false)
    await wrapper.get('[data-testid="date-preset-custom"]').trigger('click')
    const afterPreset = wrapper.emitted('update:modelValue')?.at(-1)?.[0]
    expect(afterPreset).toMatchObject({ preset: 'custom' })
    await wrapper.setProps({ modelValue: { ...defaultDashboardFilter(), preset: 'custom' } })
    expect(wrapper.find('[data-testid="date-custom-from"]').exists()).toBe(true)
  })
})
