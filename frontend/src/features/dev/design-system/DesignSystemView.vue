<script setup lang="ts">
import { computed, h, ref } from 'vue'

import { createColumnHelper, type ColumnDef } from '@tanstack/vue-table'

import Badge from '@/components/ui/badge/Badge.vue'
import Button from '@/components/ui/button/Button.vue'
import Checkbox from '@/components/ui/checkbox/Checkbox.vue'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import Input from '@/components/ui/input/Input.vue'
import Select from '@/components/ui/select/Select.vue'
import Separator from '@/components/ui/separator/Separator.vue'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import { useToast } from '@/components/ui/toast/useToast'
import AmountInput from '@/components/finance/AmountInput.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialMetric from '@/components/finance/FinancialMetric.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import DataTable from '@/components/shared/DataTable.vue'
import DetailSheet from '@/components/shared/DetailSheet.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FilterBar from '@/components/shared/FilterBar.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import { amountSortingFn } from '@/components/shared/tableSorting'

const toast = useToast()

const dialogOpen = ref(false)
const sheetOpen = ref(false)
const activeTab = ref('overview')
const searchText = ref('')
const demoName = ref('')
const demoSearch = ref('')
const checked = ref(true)
const currency = ref('cny')
const amountValue = ref('1850.39')

/** 单据详情 / 确认删除与列表共用的同一数据源选中行 */
const selectedRow = ref<TestRow | null>(null)

const currencyOptions = [
  { label: '人民币 CNY', value: 'cny' },
  { label: '美元 USD', value: 'usd' },
  { label: '欧元 EUR', value: 'eur', disabled: true },
]

/** 以下全部为虚构测试数据，仅用于组件展示 */
interface TestRow {
  id: number
  docNo: string
  customer: string
  amount: string
  status: string
  date: string
}

function statusKind(status: string): 'success' | 'brand' | 'warning' {
  switch (status) {
    case '已结清':
      return 'success'
    case '部分回款':
      return 'brand'
    default:
      return 'warning'
  }
}

const testRows: TestRow[] = Array.from({ length: 23 }, (_, index) => {
  // 前 20 条常规金额；最后 3 条覆盖负数与不同小数位（排序测试用）
  const amount =
    index === 20 ? '-100.00' : index === 21 ? '0.01' : index === 22 ? '1234.5' : (1000 + index * 137.5).toFixed(2)
  return {
    id: index + 1,
    docNo: `XS-2026-${String(index + 1).padStart(4, '0')}`,
    customer: `示例客户 ${String.fromCharCode(65 + (index % 8))}`,
    amount,
    status: index % 3 === 0 ? '待回款' : index % 3 === 1 ? '部分回款' : '已结清',
    date: `2026-11-${String((index % 28) + 1).padStart(2, '0')}`,
  }
})

/** 搜索/筛选实际作用于数据 */
const filteredRows = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  if (keyword === '') {
    return testRows
  }
  return testRows.filter(
    (row) => row.docNo.toLowerCase().includes(keyword) || row.customer.toLowerCase().includes(keyword),
  )
})

function resetFilters(): void {
  searchText.value = ''
}

function openDetail(row: TestRow): void {
  selectedRow.value = row
  sheetOpen.value = true
}

function openDelete(row: TestRow): void {
  selectedRow.value = row
  dialogOpen.value = true
}

const columnHelper = createColumnHelper<TestRow>()
const columns: ColumnDef<TestRow, string>[] = [
  columnHelper.accessor('docNo', {
    header: '单据编号',
    cell: (info) => h(DocumentNumber, { value: info.getValue() }),
  }),
  columnHelper.accessor('customer', { header: '客户' }),
  columnHelper.accessor('date', { header: '业务日期' }),
  columnHelper.accessor('amount', {
    header: '金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table' }),
  }),
  columnHelper.accessor('status', {
    header: '状态',
    cell: (info) => h(FinancialStatus, { status: info.getValue(), kind: statusKind(info.getValue()) }),
  }),
  {
    id: 'actions',
    header: '操作',
    meta: { align: 'right' },
    cell: (info) =>
      h('div', { class: 'flex items-center justify-end gap-1' }, [
        h(
          Button,
          { variant: 'ghost', size: 'sm', onClick: () => openDetail(info.row.original) },
          () => '详情',
        ),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'sm',
            class: 'text-danger-foreground',
            onClick: () => openDelete(info.row.original),
          },
          () => '删除',
        ),
      ]),
  },
]

const colorTokens = [
  { name: '--color-brand', value: '#635bff' },
  { name: '--color-brand-hover', value: '#5147e5' },
  { name: '--color-brand-subtle', value: '#eeebff' },
  { name: '--color-brand-foreground', value: '#4f46e5' },
  { name: '--color-text-primary', value: '#1a1f36' },
  { name: '--color-text-secondary', value: '#425466' },
  { name: '--color-text-muted', value: '#697386' },
  { name: '--color-background', value: '#f7f9fc' },
  { name: '--color-surface', value: '#ffffff' },
  { name: '--color-border', value: '#e3e8ee' },
  { name: '--color-success', value: '#09825d' },
  { name: '--color-success-foreground', value: '#076b4d' },
  { name: '--color-warning', value: '#b76e00' },
  { name: '--color-warning-foreground', value: '#8a5400' },
  { name: '--color-danger', value: '#cd3d64' },
  { name: '--color-danger-foreground', value: '#b02a4d' },
]

const moneySamples = ['0.00', '1,850.39', '-1,850.39', '1,000,000.00']
</script>

<template>
  <div class="flex flex-col gap-8">
    <PageHeader
      title="Design System"
      description="Factory Finance Design System V1.0 组件展示页。以下数据均为明确标记的虚构测试数据，仅供开发与测试环境使用。"
    >
      <template #actions>
        <Badge variant="warning">开发 / 测试环境专用</Badge>
      </template>
    </PageHeader>

    <!-- Color Tokens -->
    <section id="section-colors" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">Color Tokens</h2>
      <div class="grid grid-cols-2 gap-3 rounded-panel border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-4">
        <div v-for="token in colorTokens" :key="token.name" class="flex items-center gap-3">
          <span class="size-8 shrink-0 rounded-control border border-border" :style="{ backgroundColor: token.value }" />
          <div class="min-w-0">
            <p class="truncate text-table text-text-primary">{{ token.name }}</p>
            <p class="truncate text-caption text-text-muted">{{ token.value }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Typography -->
    <section id="section-typography" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">Typography</h2>
      <div class="flex flex-col gap-3 rounded-panel border border-border bg-surface p-6">
        <p class="text-page-title font-semibold text-text-primary">页面标题 24px / 600</p>
        <p class="text-section-title font-semibold text-text-primary">区域标题 16px / 600</p>
        <p class="text-body text-text-secondary">正文 14px / 400：营业收入不等于实际收款，经营费用不等于实际付款。</p>
        <p class="text-table text-text-secondary">表格正文 13px / 400：XS-2026-0001 · 示例客户 A · 2026-11-02</p>
        <p class="text-caption text-text-muted">辅助文字 12px：金额统一使用等宽数字（tabular-nums）</p>
        <p class="text-metric font-semibold text-text-primary tabular">1,850,320.50</p>
      </div>
    </section>

    <!-- Buttons -->
    <section id="section-buttons" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">Buttons</h2>
      <div class="flex flex-wrap items-center gap-3 rounded-panel border border-border bg-surface p-4">
        <Button variant="primary">主要操作</Button>
        <Button variant="secondary">次要操作</Button>
        <Button variant="ghost">幽灵按钮</Button>
        <Button variant="danger">删除</Button>
        <Button variant="secondary" size="sm">小尺寸</Button>
        <Button variant="primary" disabled>禁用状态</Button>
        <Tooltip content="工具提示内容">
          <Button variant="secondary">悬停查看提示</Button>
        </Tooltip>
      </div>
    </section>

    <!-- Inputs -->
    <section id="section-inputs" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">Inputs / AmountInput</h2>
      <div class="grid gap-6 rounded-panel border border-border bg-surface p-6 lg:grid-cols-2">
        <div class="flex flex-col gap-4">
          <FormField id="demo-name" label="客户名称" hint="基础输入控件示例">
            <Input id="demo-name" v-model="demoName" placeholder="请输入客户名称" />
          </FormField>
          <FormField id="demo-amount" label="收款金额" hint="金额输入：最多两位小数，禁止科学计数法">
            <AmountInput id="demo-amount" v-model="amountValue" />
          </FormField>
          <SearchInput v-model="demoSearch" placeholder="搜索测试数据…" />
        </div>
        <div class="flex flex-col gap-4">
          <FormField id="demo-select" label="结算币种">
            <Select id="demo-select" v-model="currency" :options="currencyOptions" />
          </FormField>
          <Checkbox v-model="checked" label="启用该测试选项" />
        </div>
      </div>
    </section>

    <!-- Tabs -->
    <section id="section-tabs" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">Tabs</h2>
      <div class="rounded-panel border border-border bg-surface p-4">
        <Tabs
          v-model="activeTab"
          :items="[
            { value: 'overview', label: '概览' },
            { value: 'detail', label: '明细' },
            { value: 'logs', label: '操作记录' },
          ]"
        >
          <template #overview>
            <p class="text-body text-text-secondary">概览内容（虚构测试数据）。</p>
          </template>
          <template #detail>
            <p class="text-body text-text-secondary">明细内容（虚构测试数据）。</p>
          </template>
          <template #logs>
            <p class="text-body text-text-secondary">操作记录内容（虚构测试数据）。</p>
          </template>
        </Tabs>
      </div>
    </section>

    <!-- DataTable -->
    <section id="section-data-table" class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-section-title font-semibold text-text-primary">DataTable</h2>
        <Badge variant="muted">虚构测试数据 · 共 {{ testRows.length }} 条</Badge>
      </div>
      <FilterBar>
        <SearchInput v-model="searchText" placeholder="搜索单据编号或客户…" />
        <Button variant="secondary" size="sm" @click="resetFilters">重置筛选</Button>
      </FilterBar>
      <div data-testid="data-table">
        <DataTable
          :columns="columns"
          :data="filteredRows"
          :page-size="10"
          :page-size-options="[10, 20, 50]"
          empty-text="暂无符合条件的单据"
        />
      </div>
    </section>

    <!-- Dialog / DetailSheet -->
    <section id="section-dialog" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">Dialog / DetailSheet</h2>
      <div class="flex flex-wrap gap-3 rounded-panel border border-border bg-surface p-4">
        <Button variant="primary" data-testid="dialog-open" @click="openDelete(testRows[0]!)">打开 Dialog</Button>
        <Button variant="secondary" data-testid="sheet-open" @click="openDetail(testRows[0]!)">打开 DetailSheet</Button>
        <Button variant="secondary" @click="toast.success('保存成功', '这是一条测试通知（虚构数据）')">显示 Toast</Button>
      </div>

      <Dialog
        v-model:open="dialogOpen"
        title="确认删除测试单据？"
        description="该操作仅作用于展示页中的虚构测试数据。"
      >
        <p v-if="selectedRow" class="text-body text-text-secondary">
          单据 <DocumentNumber :value="selectedRow.docNo" />（{{ selectedRow.customer }}，金额
          {{ selectedRow.amount }}）将被删除。
        </p>
        <template #footer>
          <Button variant="secondary" @click="dialogOpen = false">取消</Button>
          <Button variant="danger" @click="dialogOpen = false">确认删除</Button>
        </template>
      </Dialog>

      <DetailSheet v-model:open="sheetOpen" title="单据详情" description="虚构测试数据">
        <dl v-if="selectedRow" class="flex flex-col gap-4">
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">单据编号</dt>
            <dd><DocumentNumber :value="selectedRow.docNo" /></dd>
          </div>
          <Separator />
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">客户</dt>
            <dd class="text-body text-text-primary">{{ selectedRow.customer }}</dd>
          </div>
          <Separator />
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">业务日期</dt>
            <dd class="tabular text-body text-text-primary">{{ selectedRow.date }}</dd>
          </div>
          <Separator />
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">金额</dt>
            <dd><MoneyText :value="selectedRow.amount" /></dd>
          </div>
          <Separator />
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">状态</dt>
            <dd><FinancialStatus :status="selectedRow.status" :kind="statusKind(selectedRow.status)" /></dd>
          </div>
        </dl>
        <template #footer>
          <Button variant="secondary" @click="sheetOpen = false">关闭</Button>
        </template>
      </DetailSheet>
    </section>

    <!-- FinancialMetric / MoneyText -->
    <section id="section-finance" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">FinancialMetric / MoneyText</h2>
      <div class="flex flex-wrap gap-8 rounded-panel border border-border bg-surface p-6" data-testid="financial-metric">
        <FinancialMetric label="本月回款（测试数据）" value="382650.00" caption="2026-11-01 至 2026-11-26" />
        <FinancialMetric label="应收账款余额（测试数据）" value="1258300.75" />
        <FinancialMetric label="银行存款余额（测试数据）" value="-1850.39" caption="示例负数展示" />
      </div>

      <div class="rounded-panel border border-border bg-surface p-6">
        <p class="mb-3 text-caption text-text-muted">MoneyText 格式化样例（28px metric / 32px metric-lg）</p>
        <div class="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div v-for="sample in moneySamples" :key="sample" class="flex items-baseline gap-2">
            <span class="text-caption text-text-muted">{{ sample }}</span>
            <MoneyText :value="sample.replace(/,/g, '')" size="metric" />
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-caption text-text-muted">32px 样例</span>
            <MoneyText value="128800.00" size="metric-lg" />
          </div>
        </div>
      </div>
    </section>

    <!-- FinancialStatus -->
    <section id="section-status" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">FinancialStatus</h2>
      <div class="flex flex-wrap items-center gap-3 rounded-panel border border-border bg-surface p-4" data-testid="financial-status">
        <FinancialStatus status="已结清" kind="success" />
        <FinancialStatus status="部分回款" kind="brand" />
        <FinancialStatus status="待回款" kind="warning" />
        <FinancialStatus status="已逾期" kind="danger" />
        <FinancialStatus status="草稿" kind="muted" />
        <FinancialStatus status="已冲销" />
      </div>
    </section>

    <!-- States -->
    <section id="section-states" class="flex flex-col gap-4">
      <h2 class="text-section-title font-semibold text-text-primary">EmptyState / LoadingState / ErrorState</h2>
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="rounded-panel border border-border bg-surface">
          <EmptyState title="暂无应收单" description="当前筛选条件下没有应收账款记录。" />
        </div>
        <div class="rounded-panel border border-border bg-surface">
          <LoadingState :rows="4" />
          <div class="flex items-center justify-center gap-2 pb-6 text-caption text-text-muted">
            <Skeleton class="size-3 rounded-full" />
            加载中…
          </div>
        </div>
        <div class="rounded-panel border border-border bg-surface">
          <ErrorState description="请求处理失败，请稍后重试。" />
        </div>
      </div>
    </section>
  </div>
</template>
