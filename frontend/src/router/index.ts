import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'

import { DESIGN_SYSTEM_BUILD, PROTOTYPE_BUILD, isDesignSystemMode, isPrototypeMode } from '@/app/envAllowlist'
import MainLayout from '@/layouts/MainLayout.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'

const placeholder = (title: string, phase: string): { component: Component; meta: { title: string; phase: string } } => ({
  component: PlaceholderView,
  meta: { title, phase },
})

/**
 * 原型/演示页面构建期隔离（生产等非允许清单产物不携带演示业务模块）。
 *
 * 隔离开关语义唯一来源：`@/app/envAllowlist`（Phase 0.3 Task B1 允许清单语义：
 * 仅 `development` / `test` 启用演示与 Design System；production / staging / uat /
 * 自定义未知 mode 一律默认关闭，旧 `MODE !== 'production'` 语义已废除）。
 *
 * - 构建期死分支消除：动态导入三元的测试用 `PROTOTYPE_BUILD` / `DESIGN_SYSTEM_BUILD`
 *   （envAllowlist 的**静态可折叠形态**）。`import.meta.env.MODE` 在任何 Vite 构建中
 *   都被静态替换为字面量，常量折叠为 false 后死分支中的 `import('...')` 连同 chunk
 *   被 Rollup/esbuild 消除（Phase 0.2 实证机制；产物层由 scripts/verify-isolation.mjs
 *   对四 mode 构建全量扫描验证，不能只看代码）。未定义的 VITE_* 环境键不参与静态折叠，
 *   不得用作开关。
 * - 运行期守卫：`beforeEnter` 用纯函数 `isPrototypeMode` / `isDesignSystemMode`
 *   （同一允许清单语义），保证演示路由行为层同样不可访问（非仅隐藏菜单）。
 */
function prototypeGuard(): boolean {
  return isPrototypeMode(import.meta.env.MODE)
}

function designSystemGuard(): boolean {
  return isDesignSystemMode(import.meta.env.MODE)
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      { path: '', redirect: '/workbench' },
      {
        // 经营概览：非允许清单构建下回退占位页（演示业务模块不进入产物）
        path: 'workbench',
        component:
          PROTOTYPE_BUILD
            ? () => import('@/features/dashboard/DashboardView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '经营概览', prototype: true },
      },

      { path: 'treasury/accounts', ...placeholder('资金账户', 'Phase 1') },
      {
        path: 'treasury/transactions',
        component:
          PROTOTYPE_BUILD
            ? () => import('@/features/treasury/TransactionsView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '资金流水', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },

      {
        path: 'business/receivables',
        component:
          PROTOTYPE_BUILD
            ? () => import('@/features/receivables/ReceivablesView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '应收账款', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },
      {
        path: 'business/receivables/:id',
        component:
          PROTOTYPE_BUILD
            ? () => import('@/features/receivables/ReceivableDetailView.vue').then((m) => m.default)
            : () => Promise.resolve(PlaceholderView),
        meta: { title: '应收单详情', prototype: true },
        beforeEnter: () => prototypeGuard() || { path: '/workbench' },
      },
      {
        path: 'business/processing-fee',
        component:
          PROTOTYPE_BUILD
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
          DESIGN_SYSTEM_BUILD
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
