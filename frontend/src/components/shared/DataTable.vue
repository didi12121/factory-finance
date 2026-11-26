<script setup lang="ts" generic="T, TValue = unknown">
import { computed, ref, watch, type Ref } from 'vue'

import {
  FlexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/vue-table'
import { ArrowDown, ArrowUp } from '@lucide/vue'

import Table from '@/components/ui/table/Table.vue'
import TableBody from '@/components/ui/table/TableBody.vue'
import TableCell from '@/components/ui/table/TableCell.vue'
import TableHead from '@/components/ui/table/TableHead.vue'
import TableHeader from '@/components/ui/table/TableHeader.vue'
import TableRow from '@/components/ui/table/TableRow.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import TablePagination from '@/components/shared/TablePagination.vue'
import type { DataTableColumnMeta } from '@/types/table'

/**
 * 数据表格（TanStack Table）。
 *
 * 列定义契约：
 * - `meta.align` 控制对齐（'left' 默认显式 text-left / 'right' 金额列配 tabular-nums）；
 * - 金额列必须提供 `sortingFn: amountSortingFn`（compareAmounts 精确比较）。
 *
 * 服务端分页/排序契约：
 * - `manualPagination=true` 时由父组件通过 `page`/`pageSize` 控制页码并监听
 *   `update:page`/`update:pageSize`，`total` 必须传服务端总条数；
 * - `manualSorting=true` 时监听 `update:sorting` 向服务端发起查询，
 *   数据刷新后当前页超出有效范围时本组件自动钳制回最后一页；
 * - 两者为 false 时使用本地数据分页与排序（getPaginationRowModel/getSortedRowModel）。
 */
const props = withDefaults(
  defineProps<{
    columns: ColumnDef<T, TValue>[]
    data: T[]
    loading?: boolean
    emptyText?: string
    /** 服务端分页/排序时传入总数 */
    total?: number
    manualPagination?: boolean
    manualSorting?: boolean
    page?: number
    pageSize?: number
    pageSizeOptions?: number[]
  }>(),
  {
    loading: false,
    emptyText: '暂无数据',
    manualPagination: false,
    manualSorting: false,
    page: 1,
    pageSize: 20,
    pageSizeOptions: () => [20, 50, 100],
  },
)

const emit = defineEmits<{
  'update:sorting': [sorting: SortingState]
  'update:page': [page: number]
  'update:pageSize': [size: number]
}>()

const sorting: Ref<SortingState> = ref([])
const internalPage = ref(props.page)
const internalPageSize = ref(props.pageSize)

const activePage = computed(() => (props.manualPagination ? props.page : internalPage.value))
const activePageSize = computed(() => (props.manualPagination ? props.pageSize : internalPageSize.value))
const totalCount = computed(() => props.total ?? props.data.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / activePageSize.value)))

// 筛选/删除/数据刷新导致当前页超出有效范围时，自动钳制页码
watch([totalCount, activePageSize], () => {
  if (activePage.value > totalPages.value) {
    onPageChange(totalPages.value)
  }
})

const table = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  state: {
    get sorting() {
      return sorting.value
    },
    get pagination() {
      return { pageIndex: activePage.value - 1, pageSize: activePageSize.value }
    },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
    emit('update:sorting', sorting.value)
  },
  manualSorting: props.manualSorting,
  manualPagination: props.manualPagination,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: props.manualSorting ? undefined : getSortedRowModel(),
  getPaginationRowModel: props.manualPagination ? undefined : getPaginationRowModel(),
})

function columnAlign(meta: unknown): 'left' | 'center' | 'right' {
  const typed = meta as DataTableColumnMeta | undefined
  return typed?.align ?? 'left'
}

function ariaSort(columnId: string): 'ascending' | 'descending' | 'none' {
  const sorted = table.getColumn(columnId)?.getIsSorted()
  return sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
}

function onSortKeydown(event: KeyboardEvent, toggle: ((event: unknown) => void) | undefined): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggle?.(event)
  }
}

function onPageChange(page: number): void {
  if (props.manualPagination) {
    emit('update:page', page)
  } else {
    internalPage.value = page
  }
}

function onPageSizeChange(size: number): void {
  if (props.manualPagination) {
    emit('update:pageSize', size)
    emit('update:page', 1)
  } else {
    internalPageSize.value = size
    internalPage.value = 1
  }
}

const rowCount = computed(() => table.getRowModel().rows.length)
</script>

<template>
  <div class="flex flex-col gap-3">
    <Table>
      <TableHeader>
        <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <TableHead
            v-for="header in headerGroup.headers"
            :key="header.id"
            :align="columnAlign(header.column.columnDef.meta)"
            :aria-sort="header.column.getCanSort() ? ariaSort(header.id) : undefined"
            :tabindex="header.column.getCanSort() ? 0 : undefined"
            :class="header.column.getCanSort() ? 'cursor-pointer select-none hover:text-text-primary' : ''"
            role="columnheader"
            @click="header.column.getToggleSortingHandler()?.($event)"
            @keydown="onSortKeydown($event, header.column.getToggleSortingHandler())"
          >
            <span class="inline-flex items-center gap-1">
              <FlexRender
                v-if="!header.isPlaceholder"
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
              <ArrowUp
                v-if="header.column.getIsSorted() === 'asc'"
                class="size-3.5 text-brand-foreground"
                aria-hidden="true"
              />
              <ArrowDown
                v-else-if="header.column.getIsSorted() === 'desc'"
                class="size-3.5 text-brand-foreground"
                aria-hidden="true"
              />
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        <template v-if="props.loading">
          <TableRow v-for="n in 5" :key="`skeleton-${n}`">
            <TableCell v-for="c in props.columns.length" :key="c">
              <div class="h-4 w-full animate-pulse rounded-control bg-surface-hover" />
            </TableCell>
          </TableRow>
        </template>

        <template v-else-if="rowCount > 0">
          <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
            <TableCell
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              :align="columnAlign(cell.column.columnDef.meta)"
            >
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </TableCell>
          </TableRow>
        </template>

        <template v-else>
          <TableRow>
            <TableCell :colspan="props.columns.length">
              <EmptyState :title="props.emptyText" data-testid="data-table-empty" />
            </TableCell>
          </TableRow>
        </template>
      </TableBody>
    </Table>

    <TablePagination
      :page="activePage"
      :page-size="activePageSize"
      :total="totalCount"
      :page-size-options="props.pageSizeOptions"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
    />
  </div>
</template>
