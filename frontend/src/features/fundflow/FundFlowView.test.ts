import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import DataTable from '@/components/shared/DataTable.vue'
import FundFlowView from './FundFlowView.vue'
import { fail, installMockAdapter, ok, type MockReply } from '@/services/api/testAdapter'
import type { FundAccount, FundTransaction, PageResult } from '@/services/api'

const txn: FundTransaction = {
  id: 't-1',
  transactionNo: 'FT-2026-0001',
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
  remark: '出资款',
  createdAt: '2026-11-25T10:00:00',
  voidedAt: null,
}

const account: FundAccount = {
  id: 'acct-1',
  accountNo: 'FA-001',
  name: '现金账户',
  accountType: 'CASH',
  currency: 'CNY',
  openingDate: '2026-11-27', openingBalance: '0.00',
  status: 'ENABLED',
  currentBalance: '1850.39',
  remark: null,
  createdAt: '2026-11-01T09:00:00',
}

function pageResult(items: FundTransaction[]): PageResult<FundTransaction> {
  return { items, total: items.length, page: 1, size: 20 }
}

function apiHandler(): (url: string) => MockReply {
  return (url: string) => {
    if (url === '/treasury/transactions') {
      return ok(pageResult([txn]))
    }
    if (url === '/treasury/accounts') {
      return ok({ items: [account], total: 1, page: 1, size: 500 })
    }
    if (url === '/treasury/contributions/c-1/void') {
      return ok({ ...txn, status: 'VOIDED', voidedAt: '2026-11-27T08:00:00' })
    }
    return fail(404, 'NOT_FOUND', '资源不存在')
  }
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  )
}

describe('资金流水页（真实 API）', () => {
  let restore: () => void

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    restore?.()
    document.body.innerHTML = ''
  })

  async function mountView() {
    const mock = installMockAdapter((config) => apiHandler()(config.url ?? ''))
    restore = mock.restore
    const wrapper = mount(FundFlowView, { attachTo: document.body })
    await flushPromises()
    return { wrapper, mock }
  }

  it('加载资金流水（服务端分页）并展示来源单据', async () => {
    const { wrapper, mock } = await mountView()

    expect(mock.requests[0]?.url).toBe('/treasury/transactions')
    expect(mock.requests[0]?.params).toEqual({ page: 1, size: 20 })
    expect(wrapper.text()).toContain('FT-2026-0001')
    expect(wrapper.text()).toContain('现金账户')
    expect(wrapper.text()).toContain('1,850.39')
    wrapper.unmount()
  })

  it('筛选变更重新查询（关键字 + 页码重置）', async () => {
    const { wrapper, mock } = await mountView()

    await wrapper.find('[data-testid="filter-keyword"] input').setValue('FT-2026')
    await flushPromises()

    const last = mock.requests[mock.requests.length - 1]
    expect(last?.url).toBe('/treasury/transactions')
    expect(last?.params).toMatchObject({ keyword: 'FT-2026', page: 1 })
    wrapper.unmount()
  })

  it('翻页请求下一页数据', async () => {
    const { wrapper, mock } = await mountView()

    wrapper.findComponent(DataTable).vm.$emit('update:page', 2)
    await flushPromises()

    const last = mock.requests[mock.requests.length - 1]
    expect(last?.params).toMatchObject({ page: 2 })
    wrapper.unmount()
  })

  it('详情展示来源单据与撤销信息，并支持撤销来源单据（void）', async () => {
    const { wrapper, mock } = await mountView()

    // 打开详情（portal 渲染，断言基于 document.body）
    wrapper.find('[data-testid="transaction-detail-button"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('资金流水详情 · FT-2026-0001')
    expect(document.body.textContent).toContain('来源单据')
    expect(document.body.textContent).toContain('股东出资单')
    expect(document.body.textContent).toContain('撤销时间')

    // 详情内撤销入口 → 确认对话框 → void 请求
    const voidButton = document.body.querySelector<HTMLButtonElement>('[data-testid="void-source-button"]')
    expect(voidButton).not.toBeNull()
    voidButton?.click()
    await flushPromises()

    const confirmButton = findButton('确认撤销')
    expect(confirmButton).not.toBeUndefined()
    confirmButton?.click()
    await flushPromises()

    const voidRequest = mock.requests.find((request) => request.url === '/treasury/contributions/c-1/void')
    expect(voidRequest?.method).toBe('POST')
    // 撤销后列表刷新
    expect(mock.requests.filter((request) => request.url === '/treasury/transactions').length).toBeGreaterThan(1)
    wrapper.unmount()
  })

  it('加载失败展示后端错误并可重试（禁止回退演示数据）', async () => {
    let call = 0
    const mock = installMockAdapter((config) => {
      if ((config.url ?? '') === '/treasury/accounts') {
        return ok({ items: [account], total: 1, page: 1, size: 500 })
      }
      call += 1
      return call === 1
        ? fail(500, 'INTERNAL_ERROR', '服务器内部错误')
        : ok(pageResult([txn]))
    })
    restore = mock.restore
    const wrapper = mount(FundFlowView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.text()).toContain('服务器内部错误')

    await wrapper.find('[data-testid="fundflow-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('FT-2026-0001')
    wrapper.unmount()
  })
})
