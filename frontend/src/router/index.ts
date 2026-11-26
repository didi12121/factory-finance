import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'

import { DESIGN_SYSTEM_ENABLED } from '@/app/config'
import MainLayout from '@/layouts/MainLayout.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'

const placeholder = (title: string, phase: string): { component: Component; meta: { title: string; phase: string } } => ({
  component: PlaceholderView,
  meta: { title, phase },
})

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      { path: '', redirect: '/workbench' },
      { path: 'workbench', ...placeholder('经营概览', 'Phase 5') },

      { path: 'treasury/accounts', ...placeholder('资金账户', 'Phase 1') },
      { path: 'treasury/transactions', ...placeholder('资金流水', 'Phase 1') },

      { path: 'business/receivables', ...placeholder('应收账款', 'Phase 2') },
      { path: 'business/payables', ...placeholder('应付账款', 'Phase 2') },
      { path: 'business/processing-fee', ...placeholder('加工费回款', 'Phase 2') },
      { path: 'business/expenses', ...placeholder('费用管理', 'Phase 2') },
      { path: 'business/payroll', ...placeholder('工资管理', 'Phase 2') },
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
