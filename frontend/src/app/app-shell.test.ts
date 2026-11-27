import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import router, { setAuthGuardStateProvider } from '@/router'
import { AUTH_STORAGE_KEY, useAuthStore } from '@/stores/auth'

/**
 * 路由与应用布局（Phase 1：真实认证 + 正式业务页面）。
 * 说明：本用例原断言 Phase 0.2 演示（Mock Store）路由行为，Phase 1 改为
 * 真实 API 页面 + 登录守卫语义（改写记录见 docs/BACKLOG.md）。
 * 认证状态提供者由测试显式装配（与 main.ts 的 setAuthGuardStateProvider 装配一致）。
 */

/** 播种一个有效登录会话（内存 + localStorage 持久语义） */
function seedSession(pinia: Pinia): void {
  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'test-token',
      tokenType: 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'u-1', username: 'admin', displayName: '管理员' },
    }),
  )
  useAuthStore(pinia).restoreSession()
}

/** 本用例的测试 Pinia（active + 守卫提供者 + mount 同源；显式传入 pinia 避免注入上下文解析到旧实例） */
function setupPinia(): Pinia {
  const pinia = createPinia()
  setActivePinia(pinia)
  setAuthGuardStateProvider(() => useAuthStore(pinia).isAuthenticated)
  return pinia
}

function flushPromisesLike(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  window.localStorage.clear()
  setupPinia()
})

describe('路由与应用布局', () => {
  it('登录后渲染 Application Shell 并支持导航（正式业务入口）', async () => {
    const pinia = setupPinia()
    seedSession(pinia)
    const wrapper = mount(App, { global: { plugins: [router, pinia] } })

    await router.push('/workbench')
    await router.isReady()
    await flushPromisesLike()

    // 侧边栏品牌与分组
    expect(wrapper.text()).toContain('工厂财务')
    expect(wrapper.text()).toContain('资金管理')
    expect(wrapper.text()).toContain('业务管理')

    // 工作台与 Phase 1 正式业务入口
    expect(wrapper.text()).toContain('经营概览')
    for (const label of ['资金账户', '资金流水', '股东出资', '支出录入', '转账录入', '客户管理', '股东管理']) {
      expect(wrapper.text()).toContain(label)
    }
  })

  it('未登录访问业务页跳转登录页并携带回跳目标', async () => {
    const pinia = setupPinia()
    mount(App, { global: { plugins: [router, pinia] } })

    await router.push('/treasury/accounts')
    await router.isReady()
    await flushPromisesLike()

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/treasury/accounts')
  })

  it('未知路由回退到工作台（已登录）', async () => {
    const pinia = setupPinia()
    seedSession(pinia)
    mount(App, { global: { plugins: [router, pinia] } })
    await router.push('/not-exist')
    await router.isReady()
    await flushPromisesLike()
    expect(router.currentRoute.value.path).toBe('/workbench')
  })

  it('详情页高亮父级导航（/business/receivables/:id → 应收账款）', async () => {
    const pinia = setupPinia()
    seedSession(pinia)
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

  it('导航状态与页面能力一致：整组未实现仅分组级一次「规划中」', async () => {
    const pinia = setupPinia()
    seedSession(pinia)
    const wrapper = mount(App, { global: { plugins: [router, pinia] } })
    await router.push('/workbench')
    await router.isReady()
    await flushPromisesLike()

    const text = wrapper.text()
    // 分组级「规划中」标注仅出现于整组未实现的分组（财务核算/系统；基础资料已有实现项）
    expect(text.match(/规划中/g)?.length).toBe(2)
    // 已实现页面正常出现在导航
    for (const label of ['经营概览', '资金流水', '应收账款', '加工费回款']) {
      expect(text).toContain(label)
    }
  })
})
