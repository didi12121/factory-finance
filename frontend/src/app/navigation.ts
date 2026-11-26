import {
  Banknote,
  Building2,
  Calculator,
  ChartColumn,
  Cog,
  FileText,
  LayoutDashboard,
  ReceiptText,
  Users,
  Wallet,
} from '@lucide/vue'
import type { Component } from 'vue'

export interface NavItem {
  label: string
  path: string
  icon: Component
  /** 本阶段是否已实现；未实现的页面显示占位说明 */
  implemented: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: '工作台',
    items: [{ label: '经营概览', path: '/workbench', icon: LayoutDashboard, implemented: false }],
  },
  {
    label: '资金管理',
    items: [
      { label: '资金账户', path: '/treasury/accounts', icon: Wallet, implemented: false },
      { label: '资金流水', path: '/treasury/transactions', icon: Banknote, implemented: false },
    ],
  },
  {
    label: '业务管理',
    items: [
      { label: '应收账款', path: '/business/receivables', icon: ReceiptText, implemented: false },
      { label: '应付账款', path: '/business/payables', icon: ReceiptText, implemented: false },
      { label: '加工费回款', path: '/business/processing-fee', icon: Calculator, implemented: false },
      { label: '费用管理', path: '/business/expenses', icon: Banknote, implemented: false },
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
      { label: '客户管理', path: '/masterdata/customers', icon: Users, implemented: false },
      { label: '供应商管理', path: '/masterdata/suppliers', icon: Building2, implemented: false },
    ],
  },
  {
    label: '系统',
    items: [{ label: '系统设置', path: '/system/settings', icon: Cog, implemented: false }],
  },
]
