import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import FormDialog from '@/components/shared/FormDialog.vue'
import { useToast } from '@/components/ui/toast/useToast'
import ContributionListView from './ContributionListView.vue'
import { fail, installMockAdapter, ok, type MockReply } from '@/services/api/testAdapter'
import type { ContributionRecord, FundAccount, PageResult, Shareholder } from '@/services/api'

const contribution: ContributionRecord = {
  id: 'doc-1',
  docNo: 'CZ-0001',
  shareholderName: '王五',
  accountName: '现金账户',
  amount: '50000.00',
  contributionDate: '2026-11-25',
  remark: '出资款',
  status: 'CONFIRMED',
  createdAt: '2026-11-25T10:00:00',
  voidDate: null,
}

const account: FundAccount = {
  id: 'acct-1',
  accountNo: 'FA-0001',
  name: '现金账户',
  accountType: 'CASH',
  currency: 'CNY',
  openingDate: '2026-11-27', openingBalance: '0.00',
  status: 'ENABLED',
  currentBalance: '50000.00',
  remark: null,
  createdAt: '2026-11-01T09:00:00',
}

const shareholder: Shareholder = {
  id: 's-1',
  shareholderNo: 'GD-0001',
  name: '王五',
  contact: null,
  phone: null,
  status: 'ENABLED',
  remark: null,
  createdAt: '2026-11-01T09:00:00',
}

function pageOf<T>(items: T[]): PageResult<T> {
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

describe('股东出资页（真实 API）', () => {
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

  it('加载出资单据列表与字典（股东/账户名称解析）', async () => {
    install((url) => {
      if (url === '/treasury/contributions') return ok(pageOf([contribution]))
      if (url === '/treasury/accounts') return ok(pageOf([account]))
      if (url === '/masterdata/shareholders') return ok(pageOf([shareholder]))
      return fail(404, 'NOT_FOUND', '资源不存在')
    })
    const wrapper = mount(ContributionListView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.text()).toContain('CZ-0001')
    expect(wrapper.text()).toContain('王五')
    expect(wrapper.text()).toContain('现金账户')
    expect(wrapper.text()).toContain('50,000.00')
    wrapper.unmount()
  })

  it('新增出资：表单提交 POST 载荷（金额归一化为十进制字符串）', async () => {
    const mock = install((url, method) => {
      if (url === '/treasury/contributions' && method === 'GET') return ok(pageOf([contribution]))
      if (url === '/treasury/contributions' && method === 'POST') return ok(contribution)
      if (url === '/treasury/accounts') return ok(pageOf([account]))
      if (url === '/masterdata/shareholders') return ok(pageOf([shareholder]))
      return fail(404, 'NOT_FOUND', '资源不存在')
    })
    const wrapper = mount(ContributionListView, { attachTo: document.body })
    await flushPromises()

    await wrapper.find('[data-testid="create-contribution"]').trigger('click')
    await flushPromises()

    // 表单值装配（Select/AmountInput/DateInput 合法值）
    const dialog = wrapper.findComponent(FormDialog)
    dialog.vm.$emit('update:modelValue', {
      shareholderId: '1',
      accountId: '2',
      shareholderName: '王五',
      accountName: '现金账户',
      amount: '50,000.00',
      bizDate: '2026-11-27',
      remark: '出资款',
      idempotencyKey: 'test-key-contribution-0001',
    })
    await flushPromises()
    dialog.vm.$emit('submit')
    await flushPromises()

    const post = mock.requests.find((request) => request.method === 'POST' && request.url === '/treasury/contributions')
    expect(post?.body).toEqual({
      shareholderId: 1,
      accountId: 2,
      amount: '50000.00',
      contributionDate: '2026-11-27',
      remark: '出资款',
      idempotencyKey: 'test-key-contribution-0001',
    })
    wrapper.unmount()
  })

  it('表单校验拦截非法金额（不发起请求）', async () => {
    const mock = install((url) => {
      if (url === '/treasury/contributions') return ok(pageOf([contribution]))
      if (url === '/treasury/accounts') return ok(pageOf([account]))
      if (url === '/masterdata/shareholders') return ok(pageOf([shareholder]))
      return fail(404, 'NOT_FOUND', '资源不存在')
    })
    const wrapper = mount(ContributionListView, { attachTo: document.body })
    await flushPromises()

    await wrapper.find('[data-testid="create-contribution"]').trigger('click')
    await flushPromises()

    const dialog = wrapper.findComponent(FormDialog)
    dialog.vm.$emit('update:modelValue', {
      shareholderId: '1',
      accountId: '2',
      amount: '0',
      bizDate: '2026-11-27',
      remark: '',
    })
    dialog.vm.$emit('submit')
    await flushPromises()

    expect(mock.requests.some((request) => request.method === 'POST')).toBe(false)
    expect(document.body.textContent).toContain('金额必须大于 0')
    wrapper.unmount()
  })

  it('撤销：确认对话框 → POST /{id}/void → 列表刷新', async () => {
    const mock = install((url, method) => {
      if (url === '/treasury/contributions' && method === 'GET') return ok(pageOf([contribution]))
      if (url === '/treasury/contributions/doc-1/void') {
        return ok({ ...contribution, status: 'VOIDED', voidDate: '2026-11-27T08:00:00' })
      }
      if (url === '/treasury/accounts') return ok(pageOf([account]))
      if (url === '/masterdata/shareholders') return ok(pageOf([shareholder]))
      return fail(404, 'NOT_FOUND', '资源不存在')
    })
    const wrapper = mount(ContributionListView, { attachTo: document.body })
    await flushPromises()

    await wrapper.find('[data-testid="row-void"]').trigger('click')
    await flushPromises()

    const confirm = findButtonInDialogs('确认撤销')
    expect(confirm).not.toBeUndefined()
    confirm?.click()
    await flushPromises()

    const voidRequest = mock.requests.find((request) => request.url === '/treasury/contributions/doc-1/void')
    expect(voidRequest?.method).toBe('POST')
    // 撤销后列表刷新
    expect(mock.requests.filter((request) => request.url === '/treasury/contributions' && request.method === 'GET').length).toBeGreaterThan(1)
    wrapper.unmount()
  })

  it('重复撤销被拒绝（409）展示后端错误，不回退演示数据', async () => {
    const toastState = useToast()
    install((url, method) => {
      if (url === '/treasury/contributions' && method === 'GET') return ok(pageOf([contribution]))
      if (url === '/treasury/contributions/doc-1/void') return fail(409, 'CONFLICT', '单据已撤销，不可重复撤销')
      if (url === '/treasury/accounts') return ok(pageOf([account]))
      if (url === '/masterdata/shareholders') return ok(pageOf([shareholder]))
      return fail(404, 'NOT_FOUND', '资源不存在')
    })
    const wrapper = mount(ContributionListView, { attachTo: document.body })
    await flushPromises()

    await wrapper.find('[data-testid="row-void"]').trigger('click')
    await flushPromises()
    findButtonInDialogs('确认撤销')?.click()
    await flushPromises()

    // 后端错误经 Toast 提示（禁止回退演示数据）
    expect(
      toastState.toasts.value.some((toast) => toast.description?.includes('单据已撤销，不可重复撤销')),
    ).toBe(true)
    wrapper.unmount()
  })
})
