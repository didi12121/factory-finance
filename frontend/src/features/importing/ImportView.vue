<script setup lang="ts">
/**
 * 数据迁移（Excel 导入）页面 —— MVP 最小可用流程：
 * 模板下载 → 上传 → 预览（校验/重复提示）→ 确认导入 → 批次记录 → 导入核对。
 *
 * 红线：全部写入由后端业务服务完成（财务校验/事务/幂等/资金流水规则不绕过）；
 * 页面只负责选择文件、展示结果与核对，不自行计算金额。
 */
import { computed, onMounted, ref } from 'vue'

import Button from '@/components/ui/button/Button.vue'
import Select from '@/components/ui/select/Select.vue'
import Table from '@/components/ui/table/Table.vue'
import TableBody from '@/components/ui/table/TableBody.vue'
import TableCell from '@/components/ui/table/TableCell.vue'
import TableHead from '@/components/ui/table/TableHead.vue'
import TableHeader from '@/components/ui/table/TableHeader.vue'
import TableRow from '@/components/ui/table/TableRow.vue'
import FinancialMetric from '@/components/finance/FinancialMetric.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import { useToast } from '@/components/ui/toast/useToast'
import { apiErrorMessage } from '@/services/api'
import {
  confirmImport,
  downloadTemplate,
  fetchReconciliation,
  listBatches,
  listTemplates,
  previewImport,
  type ImportBatch,
  type ImportPreview,
  type ImportRow,
  type ImportTemplateInfo,
  type Reconciliation,
} from '@/services/api/importer'

const toast = useToast()

const templates = ref<ImportTemplateInfo[]>([])
const templateCode = ref('')
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const preview = ref<ImportPreview | null>(null)
const batch = ref<ImportBatch | null>(null)
const batches = ref<ImportBatch[]>([])
const reconciliation = ref<Reconciliation | null>(null)

const loading = ref(false)
const previewing = ref(false)
const importing = ref(false)
const errorText = ref<string | null>(null)

const templateOptions = computed(() =>
  templates.value.map((template) => ({ label: template.displayName, value: template.code })),
)

const selectedTemplate = computed(
  () => templates.value.find((template) => template.code === templateCode.value) ?? null,
)

const STATUS_LABELS: Record<string, string> = {
  VALID: '可导入',
  INVALID: '校验失败',
  DUPLICATE: '重复（跳过）',
  SUCCESS: '成功',
  FAILED: '失败',
}

function statusClass(status: string): string {
  if (status === 'INVALID' || status === 'FAILED') {
    return 'text-danger-foreground'
  }
  if (status === 'DUPLICATE') {
    return 'text-warning-foreground'
  }
  if (status === 'SUCCESS') {
    return 'text-success-foreground'
  }
  return 'text-text-secondary'
}

async function loadBase(): Promise<void> {
  loading.value = true
  errorText.value = null
  try {
    templates.value = await listTemplates()
    if (templateCode.value === '' && templates.value.length > 0) {
      templateCode.value = templates.value[0]!.code
    }
    await Promise.all([loadBatches(), loadReconciliation()])
  } catch (error) {
    errorText.value = apiErrorMessage(error, '数据迁移数据加载失败，请重试。')
  } finally {
    loading.value = false
  }
}

async function loadBatches(): Promise<void> {
  batches.value = await listBatches(20)
}

async function loadReconciliation(): Promise<void> {
  reconciliation.value = await fetchReconciliation()
}

onMounted(loadBase)

function onPickFile(event: Event): void {
  const target = event.target as HTMLInputElement
  selectedFile.value = target.files?.[0] ?? null
  preview.value = null
  batch.value = null
}

async function onPreview(): Promise<void> {
  if (selectedFile.value === null || templateCode.value === '') {
    toast.error('请先选择导入模板与 Excel 文件')
    return
  }
  previewing.value = true
  try {
    preview.value = await previewImport(templateCode.value, selectedFile.value)
    if (preview.value.existingBatchNo !== null) {
      toast.error(
        '该文件已导入过',
        `批次 ${preview.value.existingBatchNo}：再次确认不会重复记账，将直接返回既有批次。`,
      )
    }
  } catch (error) {
    toast.error('预览失败', apiErrorMessage(error, '文件解析失败，请使用模板下载的文件。'))
    preview.value = null
  } finally {
    previewing.value = false
  }
}

async function onConfirm(): Promise<void> {
  if (selectedFile.value === null || templateCode.value === '') {
    return
  }
  importing.value = true
  try {
    batch.value = await confirmImport(templateCode.value, selectedFile.value)
    toast.success(
      '导入完成',
      `批次 ${batch.value.batchNo}：成功 ${batch.value.successRows} 行，失败 ${batch.value.failedRows} 行，重复 ${batch.value.duplicateRows} 行`,
    )
    await Promise.all([loadBatches(), loadReconciliation()])
  } catch (error) {
    toast.error('导入失败', apiErrorMessage(error, '导入失败，请检查文件后重试。'))
  } finally {
    importing.value = false
  }
}

async function downloadSelected(): Promise<void> {
  if (selectedTemplate.value === null) {
    return
  }
  try {
    await downloadTemplate(
      selectedTemplate.value.code,
      `导入模板-${selectedTemplate.value.displayName}-${selectedTemplate.value.code.toLowerCase()}.xlsx`,
    )
  } catch (error) {
    toast.error('模板下载失败', apiErrorMessage(error, '请重试。'))
  }
}

function resetSelection(): void {
  selectedFile.value = null
  preview.value = null
  batch.value = null
  if (fileInput.value !== null) {
    fileInput.value.value = ''
  }
}

function rowMessages(row: ImportRow): string {
  return row.messages.length === 0 ? '—' : row.messages.join('；')
}

function rowSummary(row: ImportRow): string {
  return Object.entries(row.values)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ')
}
</script>

<template>
  <div class="flex flex-col gap-6" data-testid="import-page">
    <PageHeader
      title="数据迁移"
      description="Excel 导入客户/供应商/股东/资金账户/出资/支出/应收/回款；全部写入经真实业务服务校验，不绕过财务规则。"
    >
      <template #actions>
        <Button variant="secondary" data-testid="import-reload" @click="loadBase">刷新</Button>
      </template>
    </PageHeader>

    <ErrorState v-if="errorText !== null" :description="errorText">
      <template #actions>
        <Button variant="secondary" @click="loadBase">重试</Button>
      </template>
    </ErrorState>

    <div v-else-if="loading" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="4" label="数据迁移配置加载中" />
    </div>

    <template v-else>
      <!-- 1. 模板与文件 -->
      <section class="rounded-panel border border-border bg-surface p-6">
        <h2 class="text-section-title font-semibold text-text-primary">1. 选择模板并上传</h2>
        <p class="mt-1 text-caption text-text-secondary">
          请先下载模板并按说明填写；模板表头不可修改。同一文件重复确认不会重复记账。
        </p>
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <div class="w-64">
            <label class="text-caption text-text-secondary" for="import-template">导入模板</label>
            <Select
              id="import-template"
              v-model="templateCode"
              :options="templateOptions"
              data-testid="import-template"
            />
          </div>
          <Button variant="secondary" data-testid="download-template" @click="downloadSelected">
            下载模板
          </Button>
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx"
            class="text-caption"
            data-testid="import-file"
            @change="onPickFile"
          />
          <Button :disabled="previewing || selectedFile === null" data-testid="preview-import" @click="onPreview">
            {{ previewing ? '解析中…' : '上传并预览' }}
          </Button>
          <Button variant="ghost" size="sm" data-testid="reset-import" @click="resetSelection">清空</Button>
        </div>

        <div v-if="selectedTemplate !== null" class="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>列名</TableHead>
                <TableHead>必填</TableHead>
                <TableHead>格式</TableHead>
                <TableHead>示例</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="column in selectedTemplate.columns" :key="column.header">
                <TableCell>{{ column.header }}</TableCell>
                <TableCell>{{ column.required ? '必填' : '选填' }}</TableCell>
                <TableCell class="text-caption text-text-secondary">{{ column.type }}</TableCell>
                <TableCell class="text-caption text-text-muted">{{ column.example || '—' }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <!-- 2. 预览结果 -->
      <section v-if="preview !== null" class="rounded-panel border border-border bg-surface p-6" data-testid="import-preview">
        <h2 class="text-section-title font-semibold text-text-primary">2. 导入前预览</h2>
        <p v-if="preview.existingBatchNo !== null" class="mt-1 text-caption text-warning-foreground">
          该文件此前已导入（批次 {{ preview.existingBatchNo }}）：再次确认将直接返回既有批次，不会重复记账。
        </p>
        <div class="mt-4 flex flex-wrap gap-x-10 gap-y-4">
          <FinancialMetric label="总行数" :value="String(preview.totalRows)" caption="解析到的有效数据行" />
          <FinancialMetric label="可导入" :value="String(preview.validRows)" caption="校验通过的行" />
          <FinancialMetric label="校验失败" :value="String(preview.invalidRows)" caption="需修正后重新上传" />
          <FinancialMetric label="重复行" :value="String(preview.duplicateRows)" caption="已存在，导入时跳过" />
        </div>

        <div class="mt-4 max-h-96 overflow-auto rounded-panel border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-16">行号</TableHead>
                <TableHead class="w-28">状态</TableHead>
                <TableHead>数据摘要</TableHead>
                <TableHead>错误原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in preview.rows" :key="row.rowNo" :data-testid="`preview-row-${row.rowNo}`">
                <TableCell class="tabular">{{ row.rowNo }}</TableCell>
                <TableCell :class="statusClass(row.status)">{{ STATUS_LABELS[row.status] ?? row.status }}</TableCell>
                <TableCell class="text-caption text-text-secondary">{{ rowSummary(row) }}</TableCell>
                <TableCell :class="row.status === 'INVALID' ? statusClass(row.status) : 'text-caption text-text-muted'">
                  {{ rowMessages(row) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div class="mt-4 flex items-center justify-between gap-4">
          <p class="text-caption text-text-muted">
            校验失败的行不会写入任何数据；可导入行将与成功行一起生成真实业务单据与资金流水。
          </p>
          <Button
            :disabled="importing || preview.validRows === 0"
            data-testid="confirm-import"
            @click="onConfirm"
          >
            {{ importing ? '导入中…' : `确认导入（可导入 ${preview.validRows} 行）` }}
          </Button>
        </div>
      </section>

      <!-- 3. 导入结果 -->
      <section v-if="batch !== null" class="rounded-panel border border-border bg-surface p-6" data-testid="import-result">
        <h2 class="text-section-title font-semibold text-text-primary">3. 导入结果</h2>
        <p class="mt-1 text-caption text-text-secondary">
          批次 {{ batch.batchNo }} · {{ batch.fileName }} ·
          {{ batch.reused ? '该文件此前已导入，本次未重复记账' : '已按行调用业务服务写入' }}
        </p>
        <div class="mt-4 flex flex-wrap gap-x-10 gap-y-4">
          <FinancialMetric label="总行数" :value="String(batch.totalRows)" caption="文件数据行" />
          <FinancialMetric label="成功" :value="String(batch.successRows)" caption="已生成业务单据" />
          <FinancialMetric label="失败" :value="String(batch.failedRows)" caption="未产生任何业务数据" />
          <FinancialMetric label="重复跳过" :value="String(batch.duplicateRows)" caption="内容已存在" />
        </div>
        <div v-if="batch.rows.length > 0" class="mt-4 max-h-80 overflow-auto rounded-panel border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-16">行号</TableHead>
                <TableHead class="w-28">状态</TableHead>
                <TableHead>单据</TableHead>
                <TableHead>说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in batch.rows" :key="row.rowNo">
                <TableCell class="tabular">{{ row.rowNo }}</TableCell>
                <TableCell :class="statusClass(row.status)">{{ STATUS_LABELS[row.status] ?? row.status }}</TableCell>
                <TableCell class="tabular text-caption">
                  {{ row.bizDocType === null ? '—' : `${row.bizDocType}#${row.bizDocId}` }}
                </TableCell>
                <TableCell class="text-caption text-text-secondary">{{ rowMessages(row) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <!-- 4. 批次记录 -->
      <section class="rounded-panel border border-border bg-surface p-6" data-testid="import-batches">
        <h2 class="text-section-title font-semibold text-text-primary">4. 导入批次记录</h2>
        <div class="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>批次号</TableHead>
                <TableHead>模板</TableHead>
                <TableHead>文件</TableHead>
                <TableHead class="text-right">总行</TableHead>
                <TableHead class="text-right">成功</TableHead>
                <TableHead class="text-right">失败</TableHead>
                <TableHead class="text-right">重复</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in batches" :key="item.id">
                <TableCell class="tabular">{{ item.batchNo }}</TableCell>
                <TableCell>{{ item.templateCode }}</TableCell>
                <TableCell class="max-w-64 truncate text-caption">{{ item.fileName }}</TableCell>
                <TableCell class="text-right tabular">{{ item.totalRows }}</TableCell>
                <TableCell class="text-right tabular">{{ item.successRows }}</TableCell>
                <TableCell class="text-right tabular">{{ item.failedRows }}</TableCell>
                <TableCell class="text-right tabular">{{ item.duplicateRows }}</TableCell>
                <TableCell>{{ item.status }}</TableCell>
                <TableCell class="tabular text-caption">{{ item.importedAt ?? item.createdAt }}</TableCell>
              </TableRow>
              <TableRow v-if="batches.length === 0">
                <TableCell :colspan="9" class="text-center text-caption text-text-muted">暂无导入批次</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <!-- 5. 导入核对 -->
      <section
        v-if="reconciliation !== null"
        class="rounded-panel border border-border bg-surface p-6"
        data-testid="import-reconciliation"
      >
        <h2 class="text-section-title font-semibold text-text-primary">5. 导入核对</h2>
        <p class="mt-1 text-caption text-text-secondary">
          统计基准日 {{ reconciliation.asOf }} · 余额全部由真实数据重算（期初 + 有效流水 / 原始金额 − 有效核销），
          与导入批次金额无关，避免期初与历史流水重复计算。
        </p>

        <div class="mt-4 flex flex-wrap gap-x-10 gap-y-4">
          <FinancialMetric label="总资金余额" :value="reconciliation.totalFundBalance" caption="Σ 账户余额" />
          <FinancialMetric
            label="总应收余额"
            :value="reconciliation.totalReceivableOutstanding"
            caption="Σ 客户未收"
          />
          <FinancialMetric
            label="总应付余额"
            :value="reconciliation.totalPayableOutstanding"
            caption="Σ 供应商未付"
          />
          <FinancialMetric
            label="导入成功行"
            :value="String(reconciliation.importStats.successRows)"
            :caption="`失败 ${reconciliation.importStats.failedRows} · 重复 ${reconciliation.importStats.duplicateRows}`"
          />
        </div>

        <ul v-if="reconciliation.warnings.length > 0" class="mt-4 flex flex-col gap-1" role="alert">
          <li
            v-for="(warning, index) in reconciliation.warnings"
            :key="index"
            class="text-caption text-warning-foreground"
          >
            {{ warning }}
          </li>
        </ul>

        <div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div>
            <h3 class="text-table font-semibold text-text-primary">资金账户余额</h3>
            <div class="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>账户</TableHead>
                    <TableHead class="text-right">期初</TableHead>
                    <TableHead class="text-right">当前余额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="account in reconciliation.accounts" :key="account.accountNo">
                    <TableCell class="text-caption">{{ account.name }}</TableCell>
                    <TableCell class="text-right"><MoneyText :value="account.openingBalance" size="table" /></TableCell>
                    <TableCell class="text-right"><MoneyText :value="account.balance" size="table" /></TableCell>
                  </TableRow>
                  <TableRow v-if="reconciliation.accounts.length === 0">
                    <TableCell :colspan="3" class="text-center text-caption text-text-muted">暂无资金账户</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 class="text-table font-semibold text-text-primary">客户应收余额</h3>
            <div class="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客户</TableHead>
                    <TableHead class="text-right">未收余额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="item in reconciliation.receivables" :key="item.customerId">
                    <TableCell class="text-caption">{{ item.customerName }}</TableCell>
                    <TableCell class="text-right"><MoneyText :value="item.outstanding" size="table" /></TableCell>
                  </TableRow>
                  <TableRow v-if="reconciliation.receivables.length === 0">
                    <TableCell :colspan="2" class="text-center text-caption text-text-muted">暂无应收余额</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 class="text-table font-semibold text-text-primary">供应商应付余额</h3>
            <div class="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>供应商</TableHead>
                    <TableHead class="text-right">未付余额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="item in reconciliation.payables" :key="item.supplierId">
                    <TableCell class="text-caption">{{ item.supplierName }}</TableCell>
                    <TableCell class="text-right"><MoneyText :value="item.outstanding" size="table" /></TableCell>
                  </TableRow>
                  <TableRow v-if="reconciliation.payables.length === 0">
                    <TableCell :colspan="2" class="text-center text-caption text-text-muted">暂无应付余额</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
