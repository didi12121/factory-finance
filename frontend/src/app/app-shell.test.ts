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
})

function flushPromisesLike(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
