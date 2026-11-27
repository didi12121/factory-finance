/**
 * receipts 测试装置（仅测试使用，不参与生产构建）：
 * 页面挂载（Pinia + memory router）、Select/AmountInput 交互、确认弹窗驱动。
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { expect } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import Select from '@/components/ui/select/Select.vue'
import ReceiptsView from '@/features/receipts/ReceiptsView.vue'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'

/** jsdom 缺失 API 补齐（reka-ui 弹层测量） */
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

const routes = [
  { path: '/business/processing-fee', component: ReceiptsView },
  { path: '/business/receivables/:id', component: { template: '<div>应收单详情占位</div>' } },
  { path: '/treasury/transactions', component: { template: '<div>资金流水占位</div>' } },
  { path: '/', redirect: '/business/processing-fee' },
]

export interface Harness {
  wrapper: VueWrapper
  router: Router
  store: ReturnType<typeof usePrototypeStore>
}

export async function settle(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

export async function mountPage(initialPath = '/business/processing-fee'): Promise<Harness> {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(initialPath)
  await router.isReady()
  const wrapper = mount(ReceiptsView, { global: { plugins: [router, pinia] } })
  await settle()
  return { wrapper, router, store: usePrototypeStore(pinia) }
}

export function getSelect(wrapper: VueWrapper, testid: string): VueWrapper<InstanceType<typeof Select>> {
  const found = wrapper
    .findAllComponents(Select)
    .find((item) => (item.vm.$attrs as Record<string, unknown>)['data-testid'] === testid)
  if (found === undefined) {
    throw new Error(`未找到 Select 控件: ${testid}`)
  }
  return found
}

export async function clickTestId(wrapper: VueWrapper, testid: string): Promise<void> {
  const target = wrapper.find(`[data-testid="${testid}"]`)
  expect(target.exists()).toBe(true)
  await target.trigger('click')
  await settle()
}

export async function openRegistration(wrapper: VueWrapper): Promise<void> {
  await clickTestId(wrapper, 'open-registration')
}

export async function chooseCustomer(wrapper: VueWrapper, customerId: string): Promise<void> {
  getSelect(wrapper, 'registration-customer').vm.$emit('update:modelValue', customerId)
  await settle()
}

export async function setInput(wrapper: VueWrapper, selector: string, value: string): Promise<void> {
  const input = wrapper.find(selector)
  expect(input.exists()).toBe(true)
  await input.setValue(value)
  await settle()
}

export function inputValue(wrapper: VueWrapper, selector: string): string {
  return (wrapper.find(selector).element as HTMLInputElement).value
}

export function summaryText(wrapper: VueWrapper, testid: string): string {
  return wrapper.find(`[data-testid="${testid}"]`).text()
}

/** 打开确认弹窗（提交前确认信息）并断言可确认 */
export async function openConfirmDialog(wrapper: VueWrapper): Promise<void> {
  await clickTestId(wrapper, 'confirm-receipt')
  const dialog = wrapper.findComponent(ConfirmDialog)
  expect(dialog.props('open')).toBe(true)
}

/** 弹窗确认（确认动作；提交幂等与防双击由 Store + submitting 双层兜底） */
export async function confirmViaDialog(wrapper: VueWrapper): Promise<void> {
  await openConfirmDialog(wrapper)
  wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
  await settle()
}

/** 断言确认按钮禁用（未分配/超额/非法金额等禁止确认场景） */
export function expectConfirmDisabled(wrapper: VueWrapper): void {
  const button = wrapper.find('[data-testid="confirm-receipt"]')
  expect(button.exists()).toBe(true)
  expect((button.element as HTMLButtonElement).disabled).toBe(true)
}
