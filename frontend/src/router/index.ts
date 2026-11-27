import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { DESIGN_SYSTEM_BUILD, PROTOTYPE_BUILD, isDesignSystemMode, isPrototypeMode } from '@/app/envAllowlist'
import { resolveLoginRedirect } from '@/features/auth/loginModel'
import MainLayout from '@/layouts/MainLayout.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'

const placeholder = (title: string, phase: string): { component: typeof PlaceholderView; meta: { title: string; phase: string; requiresAuth: true } } => ({
  component: PlaceholderView,
  meta: { title, phase, requiresAuth: true },
})

/**
 * 原型/演示页面构建期隔离（生产等非允许清单产物不携带演示业务模块）。
 *
 * 隔离开关语义唯一来源：`@/app/envAllowlist`（仅 `development` / `test` 启用演示与
 * Design System；production / staging / uat / 自定义未知 mode 一律默认关闭）。
 * 构建期死分支消除：动态导入三元的测试用 `PROTOTYPE_BUILD` / `DESIGN_SYSTEM_BUILD`
 * （静态可折叠常量）；产物层由 scripts/verify-isolation.mjs 扫描验证。
 * 运行期守卫：`beforeEnter` 用纯函数 `isPrototypeMode` / `isDesignSystemMode`。
 *
 * Phase 1 正式业务页面（登录/经营概览/资金流水/资金账户/主数据/业务录入）为
 * **真实 API 页面**，在全部构建产物中可用（不属于演示模块，不做构建期隔离）；
 * 演示业务（应收/加工费回款原型）仍保持 prototype 允许清单隔离。
 */
function prototypeGuard(): boolean {
  return isPrototypeMode(import.meta.env.MODE)
}

function designSystemGuard(): boolean {
  return isDesignSystemMode(import.meta.env.MODE)
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('@/features/auth/LoginView.vue').then((m) => m.default),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: MainLayout,
    children: [
      { path: '', redirect: '/workbench' },

      // 经营概览（真实 API）
      {
        path: 'workbench',
        component: () => import('@/features/workbench/WorkbenchView.vue').then((m) => m.default),
        meta: { title: '经营概览', requiresAuth: true },
      },

      // 资金管理（真实 API）
      {
        path: 'treasury/accounts',
        component: () => import('@/features/accounts/AccountsView.vue').then((m) => m.default),
        meta: { title: '资金账户', requiresAuth: true },
      },
      {
        path: 'treasury/transactions',
        component: () => import('@/features/fundflow/FundFlowView.vue').then((m) => m.default),
        meta: { title: '资金流水', requiresAuth: true },
      },
      {
        path: 'treasury/contributions',
        component: () => import('@/features/entries/ContributionListView.vue').then((m) => m.default),
        meta: { title: '股东出资', requiresAuth: true },
      },
      {
        path: 'treasury/expenses',
        component: () => import('@/features/entries/ExpenseListView.vue').then((m) => m.default),
        meta: { title: '支出录入', requiresAuth: true },
      },
      {
        path: 'treasury/transfers',
        component: () => import('@/features/entries/TransferListView.vue').then((m) => m.default),
        meta: { title: '转账录入', requiresAuth: true },
      },

      // 演示业务（原型，仅 development / test 构建可见；不进入生产产物）
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

      {
        path: 'masterdata/customers',
        component: () => import('@/features/masterdata/CustomersView.vue').then((m) => m.default),
        meta: { title: '客户管理', requiresAuth: true },
      },
      {
        path: 'masterdata/shareholders',
        component: () => import('@/features/masterdata/ShareholdersView.vue').then((m) => m.default),
        meta: { title: '股东管理', requiresAuth: true },
      },
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

/**
 * 认证状态提供者（由 `main.ts` 装配为 `() => useAuthStore().isAuthenticated`）。
 * 守卫不直接解析 Pinia（vue-router 守卫运行于安装应用的注入上下文，
 * 多应用/测试场景可能解析到错误的 Pinia 实例）；未装配时视为未登录（fail-closed）。
 */
let authStateProvider: (() => boolean) | null = null

export function setAuthGuardStateProvider(provider: () => boolean): void {
  authStateProvider = provider
}

/**
 * 路由守卫（认证）：
 * - 未登录访问业务页（requiresAuth）→ /login 并携带 redirect 回跳原目标路由；
 * - 已登录访问 /login → 直接回跳目标路由（默认 /workbench）。
 */
router.beforeEach((to) => {
  const isAuthenticated = authStateProvider?.() ?? false
  if (to.meta.requiresAuth === true && !isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/login' && isAuthenticated) {
    return { path: resolveLoginRedirect(to.query.redirect) }
  }
  return true
})

export default router
