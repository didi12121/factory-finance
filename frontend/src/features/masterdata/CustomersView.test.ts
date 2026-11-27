import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import CustomersView from './CustomersView.vue'
import { fail, installMockAdapter, ok, type MockReply } from '@/services/api/testAdapter'
import type { Customer, PageResult } from '@/services/api'

const customer: Customer = {
  id: 'c-1',
  customerNo: 'KH-0001',
  name: '华东精密',
  contact: '李四',
  phone: '13800000000',
  address: '上海市',
  status: 'ENABLED',
  remark: null,
  createdAt: '2026-11-01T09:00:00',
}

function pageResult(items: Customer[]): PageResult<Customer> {
  return { items, total: items.length, page: 1, size: 20 }
}

function findButtonInDialogs(text: string): HTMLButtonElement | undefined {
  const dialogs = Array.from(document.body.querySelectorAll('[role="dialog"]'))
  for (const dialog of dialogs.reverse()) {
    const button = Array.from(dialog.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === text,
    )
    if (button !== undefined) {
      return button
    }
  }
  return undefined
}

function setInput(selector: string, value: string): void {
  const element = document.querySelector<HTMLInputElement>(selector)
  if (element === null) {
    throw new Error(`input not found: ${selector}`)
  }
  element.value = value
  element.dispatchEvent(new Event('input'))
}

describe('客户管理页（真实 API）', () => {
  let restore: () => void

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    restore?.()
    document.body.innerHTML = ''
  })

  function install(routes: (url: string, method: string) => MockReply) {
    const mock = installMockAdapter((config) => routes(config.url ?? '', (config.method ?? 'get').toUpperCase()))
    restore = mock.restore
    return mock
  }

  it('加载客户列表（分页 + 编号由后端生成展示）', async () => {
    const mock = install((url) => (url === '/masterdata/customers' ? ok(pageResult([customer])) : fail(404, 'NOT_FOUND', '资源不存在')))
    const wrapper = mount(CustomersView, { attachTo: document.body })
    await flushPromises()

    expect(mock.requests[0]?.url).toBe('/masterdata/customers')
    expect(mock.requests[0]?.params).toEqual({ page: 1, size: 20 })
    expect(wrapper.text()).toContain('KH-0001')
    expect(wrapper.text()).toContain('华东精密')
    wrapper.unmount()
  })

  it('新增客户：表单提交 POST 载荷（不含编号）并刷新列表', async () => {
    const created = { ...customer, id: 'c-2', customerNo: 'KH-0002', name: '新客户' }
    const mock = install((url, method) => {
      if (url === '/masterdata/customers' && method === 'GET') {
        return ok(pageResult([customer, created]))
      }
      if (url === '/masterdata/customers' && method === 'POST') {
        return ok(created)
      }
      return fail(404, 'NOT_FOUND', '资源不存在')
    })
    const wrapper = mount(CustomersView, { attachTo: document.body })
    await flushPromises()

    await wrapper.find('[data-testid="create-customer"]').trigger('click')
    await flushPromises()

    // 表单输入（FormField/Input 真实输入链路）
    setInput('#form-name', '新客户')
    await flushPromises()

    findButtonInDialogs('新增客户')?.click()
    await flushPromises()

    const post = mock.requests.find((request) => request.method === 'POST')
    expect(post?.url).toBe('/masterdata/customers')
    expect(post?.body).toEqual({
      name: '新客户',
      contact: null,
      phone: null,
      address: null,
      remark: null,
      status: 'ENABLED',
    })
    // 列表刷新（GET 两次以上）
    expect(mock.requests.filter((request) => request.method === 'GET').length).toBeGreaterThan(1)
    wrapper.unmount()
  })

  it('后端字段级错误（400）回显到表单字段', async () => {
    install((url, method) => {
      if (url === '/masterdata/customers' && method === 'GET') {
        return ok(pageResult([]))
      }
      if (url === '/masterdata/customers' && method === 'POST') {
        return fail(400, 'VALIDATION_ERROR', '参数校验失败', { name: '客户名称已存在' })
      }
      return fail(404, 'NOT_FOUND', '资源不存在')
    })
    mount(CustomersView, { attachTo: document.body })
    await flushPromises()

    const createButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '新增客户',
    )
    createButton?.click()
    await flushPromises()

    setInput('#form-name', '华东精密')
    findButtonInDialogs('新增客户')?.click()
    await flushPromises()

    expect(document.body.textContent).toContain('客户名称已存在')
  })

  it('启停用：确认后 PUT 全量更新（状态翻转）', async () => {
    const mock = install((url, method) => {
      if (url === '/masterdata/customers' && method === 'GET') {
        return ok(pageResult([customer]))
      }
      if (url === '/masterdata/customers/c-1' && method === 'PUT') {
        return ok({ ...customer, status: 'DISABLED' })
      }
      return fail(404, 'NOT_FOUND', '资源不存在')
    })
    const wrapper = mount(CustomersView, { attachTo: document.body })
    await flushPromises()

    await wrapper.find('[data-testid="row-toggle-status"]').trigger('click')
    await flushPromises()

    // ConfirmDialog（portal）确认「停用」
    const confirm = findButtonInDialogs('停用')
    expect(confirm).not.toBeUndefined()
    confirm?.click()
    await flushPromises()

    const put = mock.requests.find((request) => request.method === 'PUT')
    expect(put?.url).toBe('/masterdata/customers/c-1')
    expect(put?.body).toMatchObject({ name: '华东精密', status: 'DISABLED' })
    wrapper.unmount()
  })
})
