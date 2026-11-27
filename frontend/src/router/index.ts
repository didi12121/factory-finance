import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { AsyncComponentLoader, Component } from 'vue'

import { DESIGN_SYSTEM_ENABLED } from '@/app/config'
import MainLayout from '@/layouts/MainLayout.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'

const placeholder = (title: string, phase: string): { component: Component; meta: { title: string; phase: string } } => ({
  component: PlaceholderView,
  meta: { title, phase },
})

/**
 * 原型/演示页面的构建期隔离加载器。
 *
 * `import.meta.env.DEV` 与 `import.meta.env.VITE_ENABLE_PROTOTYPE` 在构建时被静态替换：
 * 生产构建（未启用原型开关）时条件分支折叠为 false，动态导入的演示业务模块
 * （含 Fixtures 与 Mock Store）连同独立 chunk 一起被 Rollup 消除，不进入产物；
 * 同时 beforeEnter 路由守卫保证演示路由不可访问（非仅隐藏菜单）。
 */
function prototypeView(loader: AsyncComponentLoader): () => Promise<Component> {
  return async () => {
    if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_PROTOTYPE === 'true') {
      const mod = await loader()
      return (mod as { default: Component }).default
    }
    return PlaceholderView
  }
}

function prototypeGuard(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_PROTOTYPE === 'true'
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      { path: '', redirect: '/workbench' },
      {
        // 经营概览：生产构建下 loader 回退到占位页（演示业务模块不进入产物）
        path: 'workbench',
        component: prototypeView(() => import('@/features/dashboard/DashboardView.vue')),
        meta: { title: '经营概览', prototype: true },
      },

      { path: 'treasury/accounts', ...placeholder('资金账户', 'Phase 1') },
      {
        path: 'treasury/transactions',
        component: prototypeView(() => import('@/features/treasury/TransactionsView.vue')),
        meta: { title: '资金流水', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },

      {
        path: 'business/receivables',
        component: prototypeView(() => import('@/features/receivables/ReceivablesView.vue')),
        meta: { title: '应收账款', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },
      {
        path: 'business/receivables/:id',
        component: prototypeView(() => import('@/features/receivables/ReceivableDetailView.vue')),
        meta: { title: '应收单详情', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },
      {
        path: 'business/processing-fee',
        component: prototypeView(() => import('@/features/receipts/ReceiptsView.vue')),
        meta: { title: '加工费回款', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },
      { path: 'business/expenses', ...placeholder('费用管理', 'Phase 1') },
      { path: 'business/payroll', ...placeholder('工资管理', 'Phase 1') },
      { path: 'business/shareholder', ...placeholder('股东往来', 'Phase 2') },
      { path: 'business/fixed-assets', ...placeholder('固定资产', 'Phase 4') },

      { path: 'accounting/vouchers', ...placeholder('会计凭证', 'Phase 3') },
      { path: 'accounting/reports', ...placeholder('财务报表', 'Phase 4') },

      { path: 'masterdata/customers', ...placeholder('客户管理', 'Phase 1') },
      { path: 'masterdata/suppliers', ...placeholder('供应商管理', 'Phase 1') },

      { path: 'system/settings', ...placeholder('系统设置', 'Phase 1') },

      {
        path: 'dev/design-system',
        component: () => import('@/features/dev/design-system/DesignSystemView.vue'),
        meta: { title: 'Design System' },
        beforeEnter: () => (DESIGN_SYSTEM_ENABLED ? true : { path: '/workbench' }),
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/workbench' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
