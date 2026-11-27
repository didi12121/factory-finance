/**
 * 资金账户 DataTable 列定义（真实 API DTO）。
 * 金额列右对齐 + tabular；当前余额缺失显示 '—'（禁止显假数字）。
 */

import { h } from 'vue'

import type { ColumnDef } from '@tanstack/vue-table'

import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import Button from '@/components/ui/button/Button.vue'
import {
  ENABLE_STATUS_KINDS,
  ENABLE_STATUS_LABELS,
  FUND_ACCOUNT_TYPE_LABELS,
  type FundAccount,
} from '@/services/api'

const TEXT_CELL = 'text-table text-text-primary'
const MUTED_CELL = 'text-table text-text-muted'

/** 行操作上下文 */
export interface AccountColumnsContext {
  onEdit: (row: FundAccount) => void
  onToggleStatus: (row: FundAccount) => void
}

/** 资金账户列定义 */
export function buildAccountColumns(ctx: AccountColumnsContext): ColumnDef<FundAccount, string>[] {
  return [
    {
      id: 'accountNo',
      accessorFn: (row) => row.accountNo,
      header: '账户编号',
      cell: (info) => h(DocumentNumber, { value: info.getValue() }),
    },
    {
      id: 'accountName',
      accessorFn: (row) => row.name,
      header: '账户名称',
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    {
      id: 'accountType',
      accessorFn: (row) => row.accountType,
      header: '账户类型',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: TEXT_CELL }, FUND_ACCOUNT_TYPE_LABELS[info.row.original.accountType]),
    },
    {
      id: 'currency',
      accessorFn: (row) => row.currency,
      header: '币种',
      enableSorting: false,
      cell: (info) => h('span', { class: MUTED_CELL }, info.getValue()),
    },
    {
      id: 'openingBalance',
      accessorFn: (row) => row.openingBalance,
      header: '期初余额',
      meta: { align: 'right' },
      cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table' }),
    },
    {
      id: 'currentBalance',
      accessorFn: (row) => row.currentBalance ?? '',
      header: '当前余额',
      meta: { align: 'right' },
      cell: (info) =>
        info.row.original.currentBalance === null
          ? h('span', { class: MUTED_CELL }, '—')
          : h(MoneyText, { value: info.row.original.currentBalance, size: 'table' }),
    },
    {
      id: 'status',
      accessorFn: (row) => row.status,
      header: '状态',
      enableSorting: false,
      cell: (info) =>
        h(FinancialStatus, {
          status: ENABLE_STATUS_LABELS[info.row.original.status],
          kind: ENABLE_STATUS_KINDS[info.row.original.status],
        }),
    },
    {
      id: 'actions',
      header: '操作',
      enableSorting: false,
      meta: { align: 'right' },
      cell: (info) =>
        h('div', { class: 'flex justify-end gap-1' }, [
          h(
            Button,
            {
              variant: 'ghost',
              size: 'sm',
              'data-testid': 'row-edit',
              'aria-label': '编辑资金账户',
              onClick: () => ctx.onEdit(info.row.original),
            },
            () => '编辑',
          ),
          h(
            Button,
            {
              variant: 'ghost',
              size: 'sm',
              'data-testid': 'row-toggle-status',
              'aria-label': `${info.row.original.status === 'ENABLED' ? '停用' : '启用'}资金账户`,
              onClick: () => ctx.onToggleStatus(info.row.original),
            },
            () => (info.row.original.status === 'ENABLED' ? '停用' : '启用'),
          ),
        ]),
    },
  ]
}
