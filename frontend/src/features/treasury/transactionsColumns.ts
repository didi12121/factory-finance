/**
 * 资金流水 DataTable 列定义（TanStack Table）—— Agent E / P02-E。
 *
 * 列契约（复用共享 DataTable）：
 * - 金额列（收入金额/支出金额）必须使用 `amountSortingFn`（compareAmounts 精确比较），
 *   禁止按千分位格式化字符串做字典序排序；金额列右对齐 + tabular-nums（meta.align='right'）；
 * - IN 流水进收入金额列、OUT 流水进支出金额列（单条金额恒正，方向由 direction 表达），
 *   非对应方向显示 '—'，排序取值为 '0'（见 transactionsModel.incomeSortValue/outcomeSortValue）；
 * - 业务类型 ≠ 收入概念：加工费回款/股东出资仅是业务性质，金额列标题为"收入/支出"资金事实。
 */

import { h } from 'vue'

import type { ColumnDef } from '@tanstack/vue-table'

import Button from '@/components/ui/button/Button.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import { amountSortingFn } from '@/components/shared/tableSorting'
import type { EntityId, FundTransaction } from '@/features/prototype/contracts'
import {
  incomeSortValue,
  outcomeSortValue,
  sourceDocText,
  TRANSACTION_STATUS_KINDS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from './transactionsModel'

/** 列渲染上下文（账户名/收款单号解析 + 详情回调；数据来自 usePrototypeStore） */
export interface TransactionColumnsContext {
  accountName: (accountId: EntityId) => string
  receiptNoById: (receiptId: EntityId) => string | null
  onOpenDetail: (txn: FundTransaction) => void
}

const TEXT_CELL = 'text-table text-text-primary'
const MUTED_CELL = 'text-table text-text-muted'

/** 构建资金流水列定义 */
export function buildTransactionColumns(
  ctx: TransactionColumnsContext,
): ColumnDef<FundTransaction, string>[] {
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
        h('span', { class: TEXT_CELL }, TRANSACTION_TYPE_LABELS[info.row.original.transactionType]),
    },
    {
      id: 'tradeDate',
      accessorFn: (row) => row.tradeDate,
      header: '交易日期',
      cell: (info) => h('span', { class: 'tabular text-table text-text-primary' }, info.getValue()),
    },
    {
      id: 'account',
      accessorFn: (row) => row.accountId,
      header: '资金账户',
      enableSorting: false,
      cell: (info) => h('span', { class: TEXT_CELL }, ctx.accountName(info.getValue())),
    },
    {
      id: 'counterparty',
      accessorFn: (row) => row.counterparty ?? '',
      header: '交易对手',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
    },
    {
      id: 'incomeAmount',
      accessorFn: (row) => incomeSortValue(row),
      header: '收入金额',
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
      header: '支出金额',
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
      cell: (info) =>
        h(
          'span',
          { class: TEXT_CELL },
          sourceDocText(info.row.original, ctx.receiptNoById(info.row.original.sourceDocId ?? '')),
        ),
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
            'aria-label': `查看 ${info.row.original.transactionNo} 详情`,
            onClick: () => ctx.onOpenDetail(info.row.original),
          },
          () => '详情',
        ),
    },
  ]
}
