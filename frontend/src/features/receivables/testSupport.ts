/**
 * 应收模块组件测试辅助（仅测试使用）—— Agent F（P02-F）。
 *
 * 约定：真实挂载（@vue/test-utils + Pinia + vue-router memory 路由），
 * Dialog/Select 等 reka-ui 组件经 Portal 渲染到 document.body，
 * 因此统一 `attachTo: document.body` 并用 document 查询断言真实 DOM。
 */

import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { defineComponent, h, type Component } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { usePrototypeStore } from '../prototype/stores/prototype'
import ReceivableDetailView from './ReceivableDetailView.vue'
import ReceivablesView from './ReceivablesView.vue'

/** 等待微任务/定时器队列清空（store 仓储为 Promise 契约） */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** 内存路由（隔离于应用全局 router 单例）：应收列表/详情 + 回款流程目标页 */
export function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/business/receivables', component: ReceivablesView },
      { path: '/business/receivables/:id', component: ReceivableDetailView },
      {
        path: '/business/processing-fee',
        component: defineComponent({ render: () => h('div', '加工费回款（Agent G 页面）') }),
      },
    ],
  })
}

export interface MountedView {
  wrapper: VueWrapper
  router: Router
  store: ReturnType<typeof usePrototypeStore>
  pinia: Pinia
}

/** 挂载视图（真实 Pinia + 路由；attachTo body 以覆盖 Portal 内容） */
export async function mountView(
  component: Component,
  route = '/business/receivables',
  beforeMount?: (store: ReturnType<typeof usePrototypeStore>) => void,
): Promise<MountedView> {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePrototypeStore()
  beforeMount?.(store)
  const router = createTestRouter()
  await router.push(route)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [router, pinia] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router, store, pinia }
}

/** 清理挂载（卸载组件并清空 body，避免测试间 DOM 串扰） */
export function cleanupMounted(mounted: MountedView): void {
  mounted.wrapper.unmount()
  document.body.innerHTML = ''
}

/* ---------------------------------- DOM 查询辅助 ---------------------------------- */

export function q<E extends Element = HTMLElement>(selector: string): E | null {
  return document.body.querySelector<E>(selector)
}

export function qa(selector: string): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(selector))
}

/** 容器内行数（如表格 tbody tr） */
export function countRows(testId: string): number {
  return qa(`[data-testid="${testId}"] tbody tr`).length
}

/** 按文本查找按钮（精确匹配，去空白） */
export function findButton(text: string): HTMLButtonElement | null {
  const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
  return buttons.find((el) => (el.textContent ?? '').trim() === text) ?? null
}

/** 设置原生 input 值并派发 input 事件（驱动 Vue v-model） */
export function setNativeInput(el: HTMLInputElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 按占位符查找 input */
export function findInput(placeholder: string): HTMLInputElement | null {
  return q<HTMLInputElement>(`input[placeholder="${placeholder}"]`)
}

/** 派发表单 submit 事件 */
export function submitForm(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

/**
 * 激活 reka-ui Tabs 触发器（其切换由 mousedown 触发，兼容 click）。
 */
export function activateTab(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  el.click()
}

/** body 文本（覆盖 Portal 内容） */
export function bodyText(): string {
  return document.body.textContent ?? ''
}
