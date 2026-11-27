import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import router from '@/router'

describe('路由与应用布局', () => {
  it('渲染 Application Shell 并支持导航', async () => {
    const pinia = createPinia()
    const wrapper = mount(App, { global: { plugins: [router, pinia] } })

    await router.push('/workbench')
    await router.isReady()
    await flushPromisesLike()

    // 侧边栏品牌与分组
    expect(wrapper.text()).toContain('工厂财务')
    expect(wrapper.text()).toContain('资金管理')
    expect(wrapper.text()).toContain('业务管理')

    // 经营概览已接入原型页（Phase 0.2）
    expect(wrapper.text()).toContain('经营概览')

    // 导航跳转到原型页面
    await router.push('/business/receivables')
    await flushPromisesLike()
    expect(router.currentRoute.value.path).toBe('/business/receivables')
    expect(wrapper.text()).toContain('应收账款')

    // 未开发占位页面明确标记尚未实现
    await router.push('/business/shareholder')
    await flushPromisesLike()
    expect(wrapper.text()).toContain('该功能尚未实现')
    expect(wrapper.text()).toContain('尚未实现')
  })

  it('未知路由回退到工作台', async () => {
    const pinia = createPinia()
    mount(App, { global: { plugins: [router, pinia] } })
    await router.push('/not-exist')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/workbench')
  })

  it('详情页高亮父级导航（/business/receivables/:id → 应收账款）', async () => {
    const pinia = createPinia()
    const wrapper = mount(App, { global: { plugins: [router, pinia] } })

    await router.push('/business/receivables/ar-001')
    await router.isReady()
    await flushPromisesLike()

    const current = wrapper.findAll('[aria-current="page"]')
    const labels = current.map((link) => link.text())
    expect(labels.some((text) => text.includes('应收账款'))).toBe(true)
    // 精确路径未匹配时不误高亮同组其他项
    expect(labels.some((text) => text.includes('应付账款'))).toBe(false)
  })

  it('导航状态与页面能力一致：已实现项正常、整组未实现仅分组级一次「规划中」', async () => {
    const pinia = createPinia()
    const wrapper = mount(App, { global: { plugins: [router, pinia] } })
    await router.push('/workbench')
    await router.isReady()
    await flushPromisesLike()

    const text = wrapper.text()
    // 分组级「规划中」标注仅出现于整组未实现的分组（财务核算/基础资料/系统），不再逐组重复「未实现」
    expect(text.match(/规划中/g)?.length).toBe(3)
    expect(text).not.toContain('未实现')
    // 已实现原型页正常出现在导航
    for (const label of ['经营概览', '资金流水', '应收账款', '加工费回款']) {
      expect(text).toContain(label)
    }
  })
})

function flushPromisesLike(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
