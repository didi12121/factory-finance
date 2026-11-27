/**
 * 业务录入 DataTable 列定义（出资/支出/转账，真实 API DTO + 展示行）。
 *
 * 展示行（DisplayRow）在页面层由字典解析出名称后注入（名称解析是数据装配，
 * 不是渲染时推导）：字典晚到时展示行重建，TanStack 行值随 data 身份重建。
 * 金额列右对齐 + tabular（MoneyText 展示，禁止 Number 参与财务运算）；
 * 已撤销单据保留展示（禁止物理删除），不提供重复撤销入口。
 */

import { h } from 'vue'

import type { ColumnDef } from '@tanstack/vue-table'

import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import Button from '@/components/ui/button/Button.vue'
import {
  expenseCategoryLabel,
  RECORD_STATUS_KINDS,
  RECORD_STATUS_LABELS,
  type ContributionRecord,
  type ExpenseRecord,
  type TransferRecord,
} from '@/services/api'

const TEXT_CELL = 'text-table text-text-primary'
const MUTED_CELL = 'text-table text-text-muted'

/** 出资展示行（字典名称已解析） */
export type ContributionDisplayRow = ContributionRecord & {
  shareholderName: string
  accountName: string
}

/** 支出展示行 */
export type ExpenseDisplayRow = ExpenseRecord & { accountName: string }

/** 转账展示行 */
export type TransferDisplayRow = TransferRecord & {
  fromAccountName: string
  toAccountName: string
}

/** 单据状态列（共用） */
function statusColumn<T extends { status: ContributionRecord['status'] }>(
  accessor: (row: T) => string,
): ColumnDef<T, string> {
  return {
    id: 'status',
    accessorFn: accessor,
    header: '状态',
    enableSorting: false,
    cell: (info) =>
      h(FinancialStatus, {
        status: RECORD_STATUS_LABELS[info.row.original.status],
        kind: RECORD_STATUS_KINDS[info.row.original.status],
      }),
  }
}

/** 金额列（共用） */
function amountColumn<T>(accessor: (row: T) => string): ColumnDef<T, string> {
  return {
    id: 'amount',
    accessorFn: accessor,
    header: '金额',
    meta: { align: 'right' },
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table' }),
  }
}

/** 业务日期列（共用） */
function bizDateColumn<T>(accessor: (row: T) => string): ColumnDef<T, string> {
  return {
    id: 'bizDate',
    accessorFn: accessor,
    header: '业务日期',
    cell: (info) => h('span', { class: 'tabular text-table text-text-primary' }, info.getValue()),
  }
}

/** 创建时间列（共用） */
function createdAtColumn<T>(accessor: (row: T) => string): ColumnDef<T, string> {
  return {
    id: 'createdAt',
    accessorFn: accessor,
    header: '创建时间',
    enableSorting: false,
    cell: (info) => h('span', { class: 'tabular text-table text-text-secondary' }, info.getValue()),
  }
}

/** 操作列：撤销（已撤销单据不提供重复撤销入口） */
function actionsColumn<T extends { status: ContributionRecord['status'] }>(
  onVoid: (row: T) => void,
  isVoided: (row: T) => boolean,
): ColumnDef<T, string> {
  return {
    id: 'actions',
    header: '操作',
    enableSorting: false,
    meta: { align: 'right' },
    cell: (info) =>
      isVoided(info.row.original)
        ? h('span', { class: MUTED_CELL }, '—')
        : h(
            Button,
            {
              variant: 'ghost',
              size: 'sm',
              'data-testid': 'row-void',
              'aria-label': '撤销单据',
              onClick: () => onVoid(info.row.original),
            },
            () => '撤销',
          ),
  }
}

/* ------------------------------- 股东出资 ------------------------------- */

/** 出资列表列定义 */
export function buildContributionColumns(ctx: {
  onVoid: (row: ContributionDisplayRow) => void
}): ColumnDef<ContributionDisplayRow, string>[] {
  return [
    {
      id: 'contributionNo',
      accessorFn: (row) => row.contributionNo,
      header: '出资单号',
      cell: (info) => h(DocumentNumber, { value: info.getValue() }),
    },
    {
      id: 'shareholder',
      accessorFn: (row) => row.shareholderName,
      header: '股东',
      enableSorting: false,
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    {
      id: 'account',
      accessorFn: (row) => row.accountName,
      header: '入账账户',
      enableSorting: false,
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    amountColumn((row) => row.amount),
    bizDateColumn((row) => row.bizDate),
    statusColumn((row) => row.status),
    createdAtColumn((row) => row.createdAt),
    actionsColumn((row) => ctx.onVoid(row), (row) => row.status === 'VOIDED'),
  ]
}

/* -------------------------------- 支出 -------------------------------- */

/** 支出列表列定义 */
export function buildExpenseColumns(ctx: {
  onVoid: (row: ExpenseDisplayRow) => void
}): ColumnDef<ExpenseDisplayRow, string>[] {
  return [
    {
      id: 'expenseNo',
      accessorFn: (row) => row.expenseNo,
      header: '支出单号',
      cell: (info) => h(DocumentNumber, { value: info.getValue() }),
    },
    {
      id: 'category',
      accessorFn: (row) => expenseCategoryLabel(row.category),
      header: '支出分类',
      enableSorting: false,
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    {
      id: 'account',
      accessorFn: (row) => row.accountName,
      header: '付款账户',
      enableSorting: false,
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    {
      id: 'counterparty',
      accessorFn: (row) => row.counterparty ?? '',
      header: '交易对手',
      enableSorting: false,
      cell: (info) =>
        h(
          'span',
          { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL },
          info.getValue() === '' ? '—' : info.getValue(),
        ),
    },
    amountColumn((row) => row.amount),
    bizDateColumn((row) => row.bizDate),
    statusColumn((row) => row.status),
    createdAtColumn((row) => row.createdAt),
    actionsColumn((row) => ctx.onVoid(row), (row) => row.status === 'VOIDED'),
  ]
}

/* -------------------------------- 转账 -------------------------------- */

/** 转账列表列定义 */
export function buildTransferColumns(ctx: {
  onVoid: (row: TransferDisplayRow) => void
}): ColumnDef<TransferDisplayRow, string>[] {
  return [
    {
      id: 'transferNo',
      accessorFn: (row) => row.transferNo,
      header: '转账单号',
      cell: (info) => h(DocumentNumber, { value: info.getValue() }),
    },
    {
      id: 'fromAccount',
      accessorFn: (row) => row.fromAccountName,
      header: '转出账户',
      enableSorting: false,
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    {
      id: 'toAccount',
      accessorFn: (row) => row.toAccountName,
      header: '转入账户',
      enableSorting: false,
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    amountColumn((row) => row.amount),
    bizDateColumn((row) => row.bizDate),
    statusColumn((row) => row.status),
    createdAtColumn((row) => row.createdAt),
    actionsColumn((row) => ctx.onVoid(row), (row) => row.status === 'VOIDED'),
  ]
}
