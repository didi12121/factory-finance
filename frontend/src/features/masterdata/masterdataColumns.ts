/**
 * 主数据 DataTable 列定义（客户/股东，真实 API DTO）。
 * 金额/编号列遵循共享列契约；状态以 FinancialStatus 文字 + 语义色共同表达。
 */

import { h } from 'vue'

import type { ColumnDef } from '@tanstack/vue-table'

import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import Button from '@/components/ui/button/Button.vue'
import {
  ENABLE_STATUS_KINDS,
  ENABLE_STATUS_LABELS,
  type Customer,
  type Shareholder,
  type Supplier,
} from '@/services/api'

const TEXT_CELL = 'text-table text-text-primary'
const MUTED_CELL = 'text-table text-text-muted'

function textCell(value: string | null): string {
  return value ?? ''
}

/** 行操作上下文 */
export interface MasterdataColumnsContext<T> {
  onEdit: (row: T) => void
  onToggleStatus: (row: T) => void
}

function actionsColumn<T extends { id: string; status: Customer['status'] }>(
  ctx: MasterdataColumnsContext<T>,
  label: string,
): ColumnDef<T, string> {
  return {
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
            'aria-label': `编辑${label}`,
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
            'aria-label': `${info.row.original.status === 'ENABLED' ? '停用' : '启用'}${label}`,
            onClick: () => ctx.onToggleStatus(info.row.original),
          },
          () => (info.row.original.status === 'ENABLED' ? '停用' : '启用'),
        ),
      ]),
  }
}

/** 客户列表列定义 */
export function buildCustomerColumns(
  ctx: MasterdataColumnsContext<Customer>,
): ColumnDef<Customer, string>[] {
  return [
    {
      id: 'customerNo',
      accessorFn: (row) => row.customerNo,
      header: '客户编号',
      cell: (info) => h(DocumentNumber, { value: info.getValue() }),
    },
    {
      id: 'name',
      accessorFn: (row) => row.name,
      header: '名称',
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    {
      id: 'contact',
      accessorFn: (row) => textCell(row.contact),
      header: '联系人',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
    },
    {
      id: 'phone',
      accessorFn: (row) => textCell(row.phone),
      header: '电话',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
    },
    {
      id: 'address',
      accessorFn: (row) => textCell(row.address),
      header: '地址',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
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
      id: 'createdAt',
      accessorFn: (row) => row.createdAt,
      header: '创建时间',
      cell: (info) => h('span', { class: 'tabular text-table text-text-primary' }, info.getValue()),
    },
    actionsColumn(ctx, '客户'),
  ]
}

/** 供应商列表列定义（编号/名称/联系方式/状态；不提供删除，停用即保留） */
export function buildSupplierColumns(
  ctx: MasterdataColumnsContext<Supplier>,
): ColumnDef<Supplier, string>[] {
  return [
    {
      id: 'supplierNo',
      accessorFn: (row) => row.supplierNo,
      header: '供应商编号',
      cell: (info) => h(DocumentNumber, { value: info.getValue() }),
    },
    {
      id: 'name',
      accessorFn: (row) => row.name,
      header: '名称',
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    {
      id: 'contact',
      accessorFn: (row) => textCell(row.contact),
      header: '联系人',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
    },
    {
      id: 'phone',
      accessorFn: (row) => textCell(row.phone),
      header: '电话',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
    },
    {
      id: 'remark',
      accessorFn: (row) => textCell(row.remark),
      header: '备注',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
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
    actionsColumn(ctx, '供应商'),
  ]
}

/** 股东列表列定义 */
export function buildShareholderColumns(
  ctx: MasterdataColumnsContext<Shareholder>,
): ColumnDef<Shareholder, string>[] {
  return [
    {
      id: 'shareholderNo',
      accessorFn: (row) => row.shareholderNo,
      header: '股东编号',
      cell: (info) => h(DocumentNumber, { value: info.getValue() }),
    },
    {
      id: 'name',
      accessorFn: (row) => row.name,
      header: '名称',
      cell: (info) => h('span', { class: TEXT_CELL }, info.getValue()),
    },
    {
      id: 'contact',
      accessorFn: (row) => textCell(row.contact),
      header: '联系人',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
    },
    {
      id: 'phone',
      accessorFn: (row) => textCell(row.phone),
      header: '电话',
      enableSorting: false,
      cell: (info) =>
        h('span', { class: info.getValue() === '' ? MUTED_CELL : TEXT_CELL }, info.getValue() === '' ? '—' : info.getValue()),
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
      id: 'createdAt',
      accessorFn: (row) => row.createdAt,
      header: '创建时间',
      cell: (info) => h('span', { class: 'tabular text-table text-text-primary' }, info.getValue()),
    },
    actionsColumn(ctx, '股东'),
  ]
}
