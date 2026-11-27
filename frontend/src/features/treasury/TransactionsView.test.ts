/**
 * TransactionsView 页面集成测试（Agent E / P02-E）—— 真实断言：行数/金额/过滤结果/详情内容。
 *
 * - 经真实 usePrototypeStore（Mock Store 唯一数据源）加载与过滤；
 * - 搜索/类型/方向/账户过滤真实改变行数；清空筛选恢复全量；
 * - 汇总口径数字与统计范围文案真实渲染；
 * - 详情面板（DetailSheet portal）：全部字段、内部转账关联流水切换、收款单回溯；
 * - 加载/错误状态真实驱动（异步加载可观察）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import Select from '@/components/ui/select/Select.vue'
import type { FundTransaction, PageResult } from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import TransactionsView from './TransactionsView.vue'

type Store = ReturnType<typeof usePrototypeStore>

let wrapper: VueWrapper | null = null

function setup(): { store: Store; router: Router } {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePrototypeStore()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  wrapper = mount(TransactionsView, {
    global: { plugins: [pinia, router] },
  })
  return { store, router }
}

function bodyText(): string {
  return document.body.textContent ?? ''
}

/** 详情面板（reka-ui DialogPortal）内的按钮点击 */
function clickInPortal(name: string): void {
  const buttons = Array.from(document.body.querySelectorAll('button'))
  const target = buttons.find((button) => button.textContent?.trim() === name)
  expect(target, `浮层内未找到按钮「${name}」`).toBeDefined()
  target!.click()
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('资金流水列表（初始加载与汇总口径）', () => {
  it('初始渲染 22 条（每页 20 行）+ 整体口径汇总金额与统计范围文案', async () => {
    setup()
    await flushPromises()

    const table = wrapper!.find('[data-testid="transactions-table"]')
    expect(table.findAll('tbody tr').length).toBe(20)
    expect(table.text()).toContain('共 22 条')
    expect(table.text()).toContain('第 1 / 2 页')

    const summary = wrapper!.find('[data-testid="transactions-summary"]')
    expect(summary.text()).toContain('97,046.51')
    expect(summary.text()).toContain('145,385.06')
    expect(summary.text()).toContain('-48,338.55')
    expect(wrapper!.find('[data-testid="summary-scope"]').text()).toContain('已排除内部转账')
    expect(wrapper!.find('[data-testid="summary-count"]').text()).toBe(
      '当前筛选命中 22 条流水，其中 17 条计入汇总。',
    )
    // 默认排序：交易日期倒序
    expect(table.find('tbody tr td').text()).toBe('FT-2026-0022')
  })

  it('加载状态真实可观察：异步加载完成前渲染 LoadingState', async () => {
    const store = setupStoreOnly()
    let resolveQuery: ((result: PageResult<FundTransaction>) => void) | undefined
    vi.spyOn(store, 'listFundTransactions').mockReturnValue(
      new Promise<PageResult<FundTransaction>>((resolve) => {
        resolveQuery = resolve
      }),
    )
    mountView()
    await flushPromises()
    // LoadingState 以 role="status" + aria-label 表达加载中（骨架屏无可见文案）
    expect(wrapper!.find('[role="status"][aria-label="资金流水加载中"]').exists()).toBe(true)

    resolveQuery?.({ items: [], total: 0, page: 1, size: 500 })
    await flushPromises()
    expect(wrapper!.text()).toContain('暂无符合条件的流水')
  })

  it('错误状态 + 重试：查询失败渲染 ErrorState，重试后恢复真实数据', async () => {
    const store = setupStoreOnly()
    const spy = vi
      .spyOn(store, 'listFundTransactions')
      .mockRejectedValueOnce(new Error('演示查询失败'))
      .mockResolvedValue({ items: [], total: 0, page: 1, size: 500 })
    mountView()
    await flushPromises()

    expect(wrapper!.text()).toContain('加载失败')
    expect(wrapper!.text()).toContain('演示查询失败')

    Array.from(wrapper!.findAll('button'))
      .find((button) => button.text() === '重试')
      ?.trigger('click')
    await flushPromises()

    expect(wrapper!.text()).not.toContain('演示查询失败')
    expect(spy.mock.calls.length).toBe(2)
    expect(wrapper!.text()).toContain('暂无符合条件的流水')
  })
})

describe('资金流水过滤（真实改变行数）', () => {
  it('关键字搜索：示例客户 B 命中 3 条；清空筛选恢复 22 条', async () => {
    setup()
    await flushPromises()

    await wrapper!.find('input[type="search"]').setValue('示例客户 B')
    await flushPromises()

    const table = wrapper!.find('[data-testid="transactions-table"]')
    expect(table.findAll('tbody tr').length).toBe(3)
    expect(table.text()).toContain('共 3 条')

    await wrapper!.find('[data-testid="clear-filters"]').trigger('click')
    await flushPromises()

    expect(table.findAll('tbody tr').length).toBe(20)
    expect(table.text()).toContain('共 22 条')
    expect((wrapper!.find('input[type="search"]').element as HTMLInputElement).value).toBe('')
  })

  it('业务类型过滤（内部转账）：4 条 + 整体口径汇总为 0.00', async () => {
    setup()
    await flushPromises()

    wrapper!.find('[data-testid="filter-type"]').findComponent(Select).vm.$emit('update:modelValue', 'INTERNAL_TRANSFER')
    await flushPromises()

    const table = wrapper!.find('[data-testid="transactions-table"]')
    expect(table.findAll('tbody tr').length).toBe(4)
    expect(table.text()).toContain('共 4 条')
    const summary = wrapper!.find('[data-testid="transactions-summary"]')
    expect(summary.text()).toContain('0.00')
    expect(wrapper!.find('[data-testid="summary-count"]').text()).toBe(
      '当前筛选命中 4 条流水，其中 0 条计入汇总。',
    )
  })

  it('流水方向过滤（流入 IN）：11 条', async () => {
    setup()
    await flushPromises()

    wrapper!.find('[data-testid="filter-direction"]').findComponent(Select).vm.$emit('update:modelValue', 'IN')
    await flushPromises()

    const table = wrapper!.find('[data-testid="transactions-table"]')
    expect(table.findAll('tbody tr').length).toBe(11)
    expect(table.text()).toContain('共 11 条')
  })

  it('资金账户过滤（示例银行账户）：13 条 + 单账户口径汇总含内部转账划转', async () => {
    setup()
    await flushPromises()

    wrapper!.find('[data-testid="filter-account"]').findComponent(Select).vm.$emit('update:modelValue', 'acct-bank')
    await flushPromises()

    const table = wrapper!.find('[data-testid="transactions-table"]')
    expect(table.findAll('tbody tr').length).toBe(13)
    const summary = wrapper!.find('[data-testid="transactions-summary"]')
    expect(summary.text()).toContain('84,045.66')
    expect(summary.text()).toContain('152,500.50')
    expect(summary.text()).toContain('-68,454.84')
    expect(wrapper!.find('[data-testid="summary-scope"]').text()).toContain('示例银行账户')
    expect(wrapper!.find('[data-testid="summary-scope"]').text()).toContain('含内部转账账户间划转')
  })

  it('日期范围过滤（2026-11-01 ~ 2026-11-10）：4 条', async () => {
    setup()
    await flushPromises()

    await wrapper!.find('input[aria-label="交易开始日期"]').setValue('2026-11-01')
    await wrapper!.find('input[aria-label="交易结束日期"]').setValue('2026-11-10')
    await flushPromises()

    const table = wrapper!.find('[data-testid="transactions-table"]')
    expect(table.findAll('tbody tr').length).toBe(4)
    expect(table.text()).toContain('共 4 条')
  })

  it('无命中数据渲染空状态', async () => {
    setup()
    await flushPromises()

    await wrapper!.find('input[type="search"]').setValue('zzz-不存在')
    await flushPromises()

    expect(wrapper!.find('[data-testid="data-table-empty"]').exists()).toBe(true)
    expect(wrapper!.text()).toContain('暂无符合条件的流水')
  })
})

describe('交易详情（DetailSheet 全部字段 + 关联流水 + 收款单回溯）', () => {
  it('内部转账详情：全部字段 + 关联流水切换到另一方向账户流水', async () => {
    setup()
    await flushPromises()

    await wrapper!.find('input[type="search"]').setValue('FT-2026-0017')
    await flushPromises()
    await wrapper!.find('[data-testid="transactions-table"] tbody tr button').trigger('click')
    await flushPromises()

    // DetailSheet 为 portal 渲染，断言基于 document.body
    for (const text of [
      '资金流水详情 · FT-2026-0017',
      '内部标识',
      'txn-017',
      '内部转账',
      '2026-11-20',
      '示例银行账户',
      '示例现金账户',
      '流出（OUT）',
      '10,000.00',
      'tg-001',
      '已入账',
      '内部转账演示（成对流水）',
      '关联流水',
      'FT-2026-0018',
    ]) {
      expect(bodyText(), `详情缺少「${text}」`).toContain(text)
    }

    // 切换到关联流水（transferGroupId 派对的另一方向）
    clickInPortal('查看该流水')
    await flushPromises()
    expect(bodyText()).toContain('资金流水详情 · FT-2026-0018')
    expect(bodyText()).toContain('流入（IN）')
    expect(bodyText()).toContain('示例现金账户')
    // 关联流水区回指转出流水（成对互为关联）
    const related = document.body.querySelector('[data-testid="detail-related"]')
    expect(related?.textContent ?? '').toContain('FT-2026-0017')
  })

  it('加工费回款详情：收款单回溯（编号/客户/核销去向）与跨页跳转按钮', async () => {
    setup()
    await flushPromises()

    await wrapper!.find('input[type="search"]').setValue('FT-2026-0010')
    await flushPromises()
    await wrapper!.find('[data-testid="transactions-table"] tbody tr button').trigger('click')
    await flushPromises()

    for (const text of [
      '收款单 SK-2026-0002',
      '示例客户 B',
      'AR-2026-0004',
      '8,000.00',
      '查看收款单',
      '查看相关应收',
    ]) {
      expect(bodyText(), `详情缺少「${text}」`).toContain(text)
    }
    expect(document.body.querySelector('[data-testid="view-source-receipt"]')).not.toBeNull()
    expect(document.body.querySelector('[data-testid="view-related-receivables"]')).not.toBeNull()
  })

  it('手工录入流水详情无收款单回溯区（无假入口）', async () => {
    setup()
    await flushPromises()

    await wrapper!.find('input[type="search"]').setValue('FT-2026-0021')
    await flushPromises()
    await wrapper!.find('[data-testid="transactions-table"] tbody tr button').trigger('click')
    await flushPromises()

    expect(bodyText()).toContain('手工录入（无来源单据）')
    expect(document.body.querySelector('[data-testid="detail-receipt"]')).toBeNull()
  })
})

/* ------------------------------- 测试装配辅助 ------------------------------- */

function setupStoreOnly(): Store {
  const pinia = createPinia()
  setActivePinia(pinia)
  return usePrototypeStore()
}

function mountView(): void {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  wrapper = mount(TransactionsView, {
    global: { plugins: [router] },
  })
}
