import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import LoginView from './LoginView.vue'
import { setAuthToken } from '@/services/api'
import { fail, installMockAdapter, ok } from '@/services/api/testAdapter'

const FUTURE = Math.floor(Date.now() / 1000) + 3600

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/workbench', component: { template: '<div>workbench</div>' } },
      { path: '/treasury/accounts', component: { template: '<div>accounts</div>' } },
    ],
  })
}

const loginPayload = {
  accessToken: 'jwt-login',
  tokenType: 'Bearer',
  expiresAt: FUTURE,
  user: { id: 'u-1', username: 'admin', displayName: '管理员' },
}

describe('登录页（真实 API）', () => {
  let restore: () => void

  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
    setAuthToken(null)
  })

  afterEach(() => {
    restore?.()
    setAuthToken(null)
  })

  async function mountLogin(redirect?: string) {
    const router = createTestRouter()
    await router.push(redirect === undefined ? '/login' : `/login?redirect=${encodeURIComponent(redirect)}`)
    await router.isReady()
    const wrapper = mount(LoginView, {
      global: { plugins: [router, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    return { router, wrapper }
  }

  it('登录成功后跳转原目标路由（redirect 回跳）', async () => {
    const mock = installMockAdapter(() => ok(loginPayload))
    restore = mock.restore
    const { router, wrapper } = await mountLogin('/treasury/accounts')

    await wrapper.find('[data-testid="login-username"]').setValue('admin')
    await wrapper.find('[data-testid="login-password"]').setValue('secret')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await flushPromises()

    expect(mock.requests[0]?.url).toBe('/auth/login')
    expect(mock.requests[0]?.body).toEqual({ username: 'admin', password: 'secret' })
    expect(router.currentRoute.value.path).toBe('/treasury/accounts')
    wrapper.unmount()
  })

  it('登录成功且无回跳目标时默认进入经营概览', async () => {
    const mock = installMockAdapter(() => ok(loginPayload))
    restore = mock.restore
    const { router, wrapper } = await mountLogin()

    await wrapper.find('[data-testid="login-username"]').setValue('admin')
    await wrapper.find('[data-testid="login-password"]').setValue('secret')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/workbench')
    wrapper.unmount()
  })

  it('凭证错误（401）展示可读错误提示', async () => {
    const mock = installMockAdapter(() => fail(401, 'UNAUTHORIZED', '用户名或密码错误'))
    restore = mock.restore
    const { router, wrapper } = await mountLogin()

    await wrapper.find('[data-testid="login-username"]').setValue('admin')
    await wrapper.find('[data-testid="login-password"]').setValue('wrong')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await flushPromises()

    const error = wrapper.find('[data-testid="login-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('用户名或密码错误')
    expect(router.currentRoute.value.path).toBe('/login')
    wrapper.unmount()
  })

  it('表单必填校验阻止空提交（不发起请求）', async () => {
    const mock = installMockAdapter(() => ok(loginPayload))
    restore = mock.restore
    const { wrapper } = await mountLogin()

    // 提交按钮在未填时禁用；直接触发表单提交也应被校验拦截
    expect(wrapper.find('[data-testid="login-submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await flushPromises()

    expect(mock.requests.length).toBe(0)
    expect(wrapper.text()).toContain('请输入用户名')
    wrapper.unmount()
  })

  it('后端字段级错误（400 VALIDATION_ERROR）回显到字段', async () => {
    const mock = installMockAdapter(() =>
      fail(400, 'VALIDATION_ERROR', '参数校验失败', { username: '用户名长度不能超过 64' }),
    )
    restore = mock.restore
    const { wrapper } = await mountLogin()

    await wrapper.find('[data-testid="login-username"]').setValue('admin')
    await wrapper.find('[data-testid="login-password"]').setValue('secret')
    await wrapper.find('[data-testid="login-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('用户名长度不能超过 64')
    wrapper.unmount()
  })
})
