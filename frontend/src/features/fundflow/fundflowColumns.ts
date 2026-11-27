/**
 * 资金流水 DataTable 列定义（TanStack Table，真实 API DTO）。
 *
 * 列契约（复用共享 DataTable）：
 * - 金额列（流入/流出金额）必须使用 `amountSortingFn`（compareAmounts 精确比较），
 *   禁止按千分位格式化字符串做字典序排序；金额列右对齐 + tabular-nums；
 * - IN 流水进流入金额列、OUT 流水进流出金额列（单条金额恒正，方向由 direction 表达），
 *   非对应方向显示 '—'，排序取值为 '0'；
 * - 服务端分页下排序为当前页内排序（排序取值仍走精确比较）。
 */

import { h } from 'vue'

import type { ColumnDef } from '@tanstack/vue-table'

import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import Button from '@/components/ui/button/Button.vue'
import { amountSortingFn } from '@/components/shared/tableSorting'
import {
  TRANSACTION_STATUS_KINDS,
  TRANSACTION_STATUS_LABELS,
  transactionTypeLabel,
  type FundTransaction,
} from '@/services/api'
import { sourceDocText } from './fundflowModel'

/** 展示行（账户名称已解析：名称解析是数据装配，不是渲染时推导） */
export type FundflowDisplayRow = FundTransaction & { accountName: string }

/** 列渲染上下文（详情回调） */
export interface FundflowColumnsContext {
  onOpenDetail: (txn: FundflowDisplayRow) => void
}

const TEXT_CELL = 'text-table text-text-primary'
const MUTED_CELL = 'text-table text-text-muted'

/** 流入金额列排序取值：IN 流水取金额，其余取 '0' */
export function incomeSortValue(txn: FundTransaction): string {
  return txn.direction === 'IN' ? txn.amount : '0'
}

/** 流出金额列排序取值：OUT 流水取金额，其余取 '0' */
export function outcomeSortValue(txn: FundTransaction): string {
  return txn.direction === 'OUT' ? txn.amount : '0'
}

/** 构建资金流水列定义 */
export function buildFundflowColumns(
  ctx: FundflowColumnsContext,
): ColumnDef<FundflowDisplayRow, string>[] {
  return [
    {
      id: 'transactionNo',
      accessorFn: (row) => row.transactionNo,
      header: '流水编号',
      cell: (info) => h(DocumentNumber, { value: info.getValue() }),
    },
    {
      id: 'transactionType',
      accessorFn: (row) => row.transactionType,
      header: '业务类型',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: TEXT_CELL }, transactionTypeLabel(info.row.original.transactionType)),
    },
    {
      id: 'tradeDate',
      accessorFn: (row) => row.tradeDate,
      header: '交易日期',
      cell: (info) => h('span', { class: 'tabular text-table text-text-primary' }, info.getValue()),
    },
    {
      id: 'account',
      accessorFn: (row) => row.accountName,
      header: '资金账户',
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
    {
      id: 'incomeAmount',
      accessorFn: (row) => incomeSortValue(row),
      header: '流入金额',
      meta: { align: 'right' },
      sortingFn: amountSortingFn,
      cell: (info) =>
        info.row.original.direction === 'IN'
          ? h(MoneyText, { value: info.getValue(), size: 'table' })
          : h('span', { class: MUTED_CELL }, '—'),
    },
    {
      id: 'outcomeAmount',
      accessorFn: (row) => outcomeSortValue(row),
      header: '流出金额',
      meta: { align: 'right' },
      sortingFn: amountSortingFn,
      cell: (info) =>
        info.row.original.direction === 'OUT'
          ? h(MoneyText, { value: info.getValue(), size: 'table' })
          : h('span', { class: MUTED_CELL }, '—'),
    },
    {
      id: 'sourceDoc',
      accessorFn: (row) => row.sourceDocType ?? '',
      header: '来源单据',
      enableSorting: false,
      cell: (info) => h('span', { class: TEXT_CELL }, sourceDocText(info.row.original)),
    },
    {
      id: 'status',
      accessorFn: (row) => row.status,
      header: '状态',
      enableSorting: false,
      cell: (info) =>
        h(FinancialStatus, {
          status: TRANSACTION_STATUS_LABELS[info.row.original.status],
          kind: TRANSACTION_STATUS_KINDS[info.row.original.status],
        }),
    },
    {
      id: 'actions',
      header: '操作',
      enableSorting: false,
      meta: { align: 'right' },
      cell: (info) =>
        h(
          Button,
          {
            variant: 'ghost',
            size: 'sm',
            'data-testid': 'transaction-detail-button',
            'aria-label': `查看 ${info.row.original.transactionNo} 详情`,
            onClick: () => ctx.onOpenDetail(info.row.original),
          },
          () => '详情',
        ),
    },
  ]
}
