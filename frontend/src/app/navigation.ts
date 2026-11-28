import {
  ArrowLeftRight,
  Banknote,
  Building2,
  Calculator,
  ChartColumn,
  Cog,
  Coins,
  FileText,
  HandCoins,
  LayoutDashboard,
  ReceiptText,
  TrendingDown,
  Users,
  Wallet,
} from '@lucide/vue'
import type { Component } from 'vue'

export interface NavItem {
  label: string
  path: string
  icon: Component
  /**
   * 本阶段是否已交付可用页面（真实 API 或原型页）：
   * - true：已实现页面，正常可访问（含详情子路由）；
   * - false：占位页（页面明确标注尚未实现与计划阶段），导航项以禁用样式呈现。
   * 导航分组状态必须与页面能力一致，禁止矛盾标注。
   */
  implemented: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: '工作台',
    items: [{ label: '经营概览', path: '/workbench', icon: LayoutDashboard, implemented: true }],
  },
  {
    label: '资金管理',
    items: [
      { label: '资金账户', path: '/treasury/accounts', icon: Wallet, implemented: true },
      { label: '资金流水', path: '/treasury/transactions', icon: Banknote, implemented: true },
      { label: '股东出资', path: '/treasury/contributions', icon: HandCoins, implemented: true },
      { label: '支出录入', path: '/treasury/expenses', icon: TrendingDown, implemented: true },
      { label: '转账录入', path: '/treasury/transfers', icon: ArrowLeftRight, implemented: true },
    ],
  },
  {
    label: '业务管理',
    items: [
      { label: '应收账款', path: '/business/receivables', icon: ReceiptText, implemented: true },
      { label: '应付账款', path: '/business/payables', icon: ReceiptText, implemented: true },
      { label: '加工费回款', path: '/business/processing-fee', icon: Calculator, implemented: true },
      { label: '费用管理', path: '/business/expenses', icon: Coins, implemented: false },
      { label: '工资管理', path: '/business/payroll', icon: Users, implemented: false },
      { label: '股东往来', path: '/business/shareholder', icon: Users, implemented: false },
      { label: '固定资产', path: '/business/fixed-assets', icon: Building2, implemented: false },
    ],
  },
  {
    label: '财务核算',
    items: [
      { label: '会计凭证', path: '/accounting/vouchers', icon: FileText, implemented: false },
      { label: '财务报表', path: '/accounting/reports', icon: ChartColumn, implemented: false },
    ],
  },
  {
    label: '基础资料',
    items: [
      { label: '客户管理', path: '/masterdata/customers', icon: Users, implemented: true },
      { label: '股东管理', path: '/masterdata/shareholders', icon: HandCoins, implemented: true },
      { label: '供应商管理', path: '/masterdata/suppliers', icon: Building2, implemented: true },
    ],
  },
  {
    label: '系统',
    items: [{ label: '系统设置', path: '/system/settings', icon: Cog, implemented: false }],
  },
]
