import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'

import MainLayout from '@/layouts/MainLayout.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'

const placeholder = (title: string, phase: string): { component: Component; meta: { title: string; phase: string } } => ({
  component: PlaceholderView,
  meta: { title, phase },
})

/**
 * 原型/演示页面构建期隔离（生产产物不携带演示业务模块）。
 *
 * 使用 `import.meta.env.MODE` 作为构建期开关：该表达式在任何 Vite 构建中都被
 * **静态替换为字面量**（development/test/production），生产构建下
 * `'production' !== 'production'` 折叠为 false，死分支中的 `import('...')`
 * 连同 chunk 被 Rollup/esbuild 消除（QA F-001 整改确认机制；未定义的
 * VITE_* 环境键不参与静态折叠，不得用作开关）。
 * beforeEnter 路由守卫保证演示路由行为层同样不可访问（非仅隐藏菜单）。
 */
const NON_PRODUCTION_BUILD = import.meta.env.MODE !== 'production'

function prototypeGuard(): boolean {
  return NON_PRODUCTION_BUILD
}

function designSystemGuard(): boolean {
  return NON_PRODUCTION_BUILD
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      { path: '', redirect: '/workbench' },
      {
        // 经营概览：生产构建下回退占位页（演示业务模块不进入产物）
        path: 'workbench',
        component:
          NON_PRODUCTION_BUILD
            ? () => import('@/features/dashboard/DashboardView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '经营概览', prototype: true },
      },

      { path: 'treasury/accounts', ...placeholder('资金账户', 'Phase 1') },
      {
        path: 'treasury/transactions',
        component:
          NON_PRODUCTION_BUILD
            ? () => import('@/features/treasury/TransactionsView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '资金流水', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },

      {
        path: 'business/receivables',
        component:
          NON_PRODUCTION_BUILD
            ? () => import('@/features/receivables/ReceivablesView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '应收账款', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },
      {
        path: 'business/receivables/:id',
        component:
          NON_PRODUCTION_BUILD
            ? () => import('@/features/receivables/ReceivableDetailView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '应收单详情', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },
      {
        path: 'business/processing-fee',
        component:
          NON_PRODUCTION_BUILD
            ? () => import('@/features/receipts/ReceiptsView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '加工费回款', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },
      { path: 'business/expenses', ...placeholder('费用管理', 'Phase 1') },
      { path: 'business/payables', ...placeholder('应付账款', 'Phase 2') },
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
        component:
          NON_PRODUCTION_BUILD
            ? () => import('@/features/dev/design-system/DesignSystemView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: 'Design System' },
        beforeEnter: () => designSystemGuard() || { path: '/workbench' },
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
