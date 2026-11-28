/**
 * 应收/回款业务 Store（真实后端 + MySQL 的单一数据源）。
 *
 * 设计：页面层与纯逻辑层（receivableList / receiptModel / domain 函数）保持不变，
 * 只把数据源从 Phase 0.2 的内存 Mock Store 换成真实 API；
 * 已收/未收/回款状态/逾期一律读取后端派生值（不重复计算财务口径）。
 *
 * 红线：
 * - 金额为 DecimalString，运算走 utils/decimal（BigInt 定点）；
 * - 失败不回退 Mock 数据；
 * - 写操作携带请求幂等键，由后端唯一约束保证不重复记账。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { DecimalString } from '@/utils/decimal'
import { todayLocalDate } from '@/utils/localDate'
import {
  masterdataApi,
  receivableApi,
  treasuryApi,
  type AllocationPreview as ApiAllocationPreview,
  type FundAccount as ApiFundAccount,
  type ReceiptRecord,
  type ReceivableRecord,
} from '@/services/api'
import type {
  AllocationPreview,
  BusinessError,
  ConfirmReceiptCommand,
  CreateReceivableCommand,
  Customer,
  EntityId,
  FundAccount,
  LocalDate,
  PageResult,
  PreviewReceiptAllocationCommand,
  Receipt,
  ReceiptAllocation,
  ReceiptDetail,
  ReceiptListQuery,
  Receivable,
  ReceivableListQuery,
  ReceivableView,
} from '@/features/prototype/contracts'
import { newIdempotencyKey } from '@/utils/idempotency'

/** 业务 Store 的写操作结果（成功返回实体，失败由 ApiClientError 上抛） */
export const useBusinessStore = defineStore('business', () => {
  /** 业务基准日（逾期判定由后端给出，此处仅用于展示） */
  const today = ref<LocalDate>(todayLocalDate())
  const loading = ref(false)
  const loadError = ref<string | null>(null)

  /* ------------------------------ 只读状态 ------------------------------ */

  const customers = ref<Customer[]>([])
  const fundAccounts = ref<FundAccount[]>([])
  const receivablesRaw = ref<ReceivableRecord[]>([])
  const receiptsRaw = ref<ReceiptRecord[]>([])

  /** 应收单（契约实体投影；已撤销单据不进入业务列表） */
  const receivables = computed<Receivable[]>(() =>
    receivablesRaw.value
      .filter((row) => row.status === 'CONFIRMED')
      .map((row) => ({
        id: String(row.id),
        statementNo: row.statementNo,
        customerId: String(row.customerId),
        accountingMonth: row.accountingMonth,
        statementDate: row.statementDate,
        dueDate: row.dueDate,
        originalAmount: row.originalAmount,
        remark: row.remark,
        createdAt: row.createdAt ?? '',
      })),
  )

  /** 收款单（契约实体投影） */
  const receipts = computed<Receipt[]>(() =>
    receiptsRaw.value
      .filter((row) => row.status === 'CONFIRMED')
      .map((row) => ({
        id: String(row.id),
        receiptNo: row.receiptNo,
        customerId: String(row.customerId),
        receiptDate: row.receiptDate,
        accountId: String(row.accountId),
        actualAmount: row.actualAmount,
        fundTransactionId: row.fundTransactionId === null ? '' : String(row.fundTransactionId),
        externalRef: row.externalRef,
        remark: row.remark,
        idempotencyKey: '',
      })),
  )

  /** 有效核销明细（撤销收款后后端置 REVERSED，不参与应收余额派生） */
  const receiptAllocations = computed<ReceiptAllocation[]>(() => {
    const result: ReceiptAllocation[] = []
    for (const receipt of receiptsRaw.value) {
      if (receipt.status !== 'CONFIRMED') {
        continue
      }
      for (const allocation of receipt.allocations) {
        if (allocation.status !== 'ACTIVE') {
          continue
        }
        result.push({
          id: String(allocation.id),
          receiptId: String(allocation.receiptId),
          receivableId: String(allocation.receivableId),
          allocationAmount: allocation.allocationAmount,
          allocatedAt: allocation.allocatedAt ?? '',
        })
      }
    }
    return result
  })

  /** 应收组合视图（已收/未收/状态/逾期取自后端派生值） */
  const receivableViews = computed<ReceivableView[]>(() =>
    receivablesRaw.value
      .filter((row) => row.status === 'CONFIRMED')
      .map((row) => ({
        receivable: {
          id: String(row.id),
          statementNo: row.statementNo,
          customerId: String(row.customerId),
          accountingMonth: row.accountingMonth,
          statementDate: row.statementDate,
          dueDate: row.dueDate,
          originalAmount: row.originalAmount,
          remark: row.remark,
          createdAt: row.createdAt ?? '',
        },
        summary: {
          paidAmount: row.paidAmount,
          outstandingAmount: row.outstandingAmount,
          status: row.paymentStatus,
          isOverdue: row.overdue,
          asOf: today.value,
        },
      })),
  )

  const accountBalanceViews = computed<{ account: FundAccount; balance: DecimalString }[]>(() =>
    fundAccounts.value.map((account) => ({ account, balance: account.openingBalance })),
  )

  /* ------------------------------ 同步定位查询 ------------------------------ */

  function customerById(id: EntityId): Customer | null {
    return customers.value.find((item) => item.id === id) ?? null
  }

  function accountById(id: EntityId): FundAccount | null {
    return fundAccounts.value.find((item) => item.id === id) ?? null
  }

  function receivableViewById(id: EntityId): ReceivableView | null {
    return receivableViews.value.find((item) => item.receivable.id === id) ?? null
  }

  function receiptDetailById(id: EntityId): ReceiptDetail | null {
    const receipt = receipts.value.find((item) => item.id === id)
    if (receipt === undefined) {
      return null
    }
    return {
      receipt,
      allocations: receiptAllocations.value.filter((item) => item.receiptId === id),
    }
  }

  /** 收款单对应资金流水号（一笔收款只对应一条流水） */
  function transactionNoOfReceipt(receiptId: EntityId): string | null {
    const raw = receiptsRaw.value.find((item) => item.id === receiptId)
    return raw?.fundTransactionNo ?? null
  }

  /** 应收单编号（核销明细展示） */
  function statementNoOf(receivableId: EntityId): string | null {
    return receivablesRaw.value.find((item) => item.id === receivableId)?.statementNo ?? null
  }

  /* ------------------------------ 数据加载 ------------------------------ */

  /** 加载业务基础数据（客户/账户）与全部应收/收款（页面首次进入调用） */
  async function load(): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      today.value = todayLocalDate()
      const [customerPage, accountPage, receivablePage, receiptPage] = await Promise.all([
        masterdataApi.listCustomers({ page: 1, size: 500 }),
        masterdataApi.listAccounts({ page: 1, size: 500 }),
        receivableApi.listReceivables({ page: 1, size: 500 }),
        receivableApi.listReceipts({ page: 1, size: 500 }),
      ])
      customers.value = customerPage.items.map((customer) => ({
        id: String(customer.id),
        name: customer.name,
        status: customer.status,
      }))
      fundAccounts.value = accountPage.items.map(mapAccount)
      receivablesRaw.value = receivablePage.items.map(normalizeReceivable)
      receiptsRaw.value = receiptPage.items.map(normalizeReceipt)
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : '业务数据加载失败'
      throw error
    } finally {
      loading.value = false
    }
  }

  /** 只加载应收单（回款登记页按客户筛选待核销单据；契约查询语义 → 真实 API） */
  async function listReceivables(query: ReceivableListQuery): Promise<PageResult<ReceivableView>> {
    const result = await receivableApi.listReceivables({
      page: query.page,
      size: query.size,
      keyword: query.keyword,
      customerId: query.customerId,
      paymentStatus: query.status,
      overdueOnly: query.overdueOnly,
      dateFrom: query.dateRange?.from ?? undefined,
      dateTo: query.dateRange?.to ?? undefined,
    })
    const items = result.items.map((row) => ({
      receivable: {
        id: String(row.id),
        statementNo: row.statementNo,
        customerId: String(row.customerId),
        accountingMonth: row.accountingMonth,
        statementDate: row.statementDate,
        dueDate: row.dueDate,
        originalAmount: row.originalAmount,
        remark: row.remark,
        createdAt: row.createdAt ?? '',
      },
      summary: {
        paidAmount: row.paidAmount,
        outstandingAmount: row.outstandingAmount,
        status: row.paymentStatus,
        isOverdue: row.overdue,
        asOf: today.value,
      },
    }))
    if (query.customerId === undefined) {
      receivablesRaw.value = result.items.map(normalizeReceivable)
    }
    return { items, total: result.total, page: result.page, size: result.size }
  }

  async function listReceipts(query: ReceiptListQuery): Promise<PageResult<Receipt>> {
    const result = await receivableApi.listReceipts({
      page: query.page,
      size: query.size,
      keyword: query.keyword,
      customerId: query.customerId,
      accountId: query.accountId,
      dateFrom: query.dateRange?.from ?? undefined,
      dateTo: query.dateRange?.to ?? undefined,
    })
    const items = result.items.map((row) => ({
      id: String(row.id),
      receiptNo: row.receiptNo,
      customerId: String(row.customerId),
      receiptDate: row.receiptDate,
      accountId: String(row.accountId),
      actualAmount: row.actualAmount,
      fundTransactionId: row.fundTransactionId === null ? '' : String(row.fundTransactionId),
      externalRef: row.externalRef,
      remark: row.remark,
      idempotencyKey: '',
    }))
    return { items, total: result.total, page: result.page, size: result.size }
  }

  async function getReceivableById(id: EntityId): Promise<ReceivableView | null> {
    const row = await receivableApi.getReceivable(id)
    return {
      receivable: {
        id: String(row.id),
        statementNo: row.statementNo,
        customerId: String(row.customerId),
        accountingMonth: row.accountingMonth,
        statementDate: row.statementDate,
        dueDate: row.dueDate,
        originalAmount: row.originalAmount,
        remark: row.remark,
        createdAt: row.createdAt ?? '',
      },
      summary: {
        paidAmount: row.paidAmount,
        outstandingAmount: row.outstandingAmount,
        status: row.paymentStatus,
        isOverdue: row.overdue,
        asOf: today.value,
      },
    }
  }

  async function listReceivableAllocations(receivableId: EntityId): Promise<ReceiptAllocation[]> {
    const row = await receivableApi.getReceivable(receivableId)
    // 后端按应收单派生已收明细；此处仅返回有效核销（撤销收款后置 REVERSED 不计）
    return receiptAllocations.value.filter(
      (item) => item.receivableId === receivableId && row.paidAmount !== null,
    )
  }

  async function getReceiptById(id: EntityId): Promise<ReceiptDetail | null> {
    const row = await receivableApi.getReceipt(id)
    return {
      receipt: {
        id: String(row.id),
        receiptNo: row.receiptNo,
        customerId: String(row.customerId),
        receiptDate: row.receiptDate,
        accountId: String(row.accountId),
        actualAmount: row.actualAmount,
        fundTransactionId: row.fundTransactionId === null ? '' : String(row.fundTransactionId),
        externalRef: row.externalRef,
        remark: row.remark,
        idempotencyKey: '',
      },
      allocations: row.allocations
        .filter((allocation) => allocation.status === 'ACTIVE')
        .map((allocation) => ({
          id: String(allocation.id),
          receiptId: String(allocation.receiptId),
          receivableId: String(allocation.receivableId),
          allocationAmount: allocation.allocationAmount,
          allocatedAt: allocation.allocatedAt ?? '',
        })),
    }
  }

  /* ------------------------------ 写操作 ------------------------------ */

  /** 新建应收单（不产生资金流水；需稳定幂等键） */
  async function createReceivable(command: CreateReceivableCommand & { idempotencyKey?: string }): Promise<Receivable> {
    const created = await receivableApi.createReceivable({
      customerId: Number(command.customerId),
      accountingMonth: command.accountingMonth,
      statementDate: command.statementDate,
      dueDate: command.dueDate,
      amount: command.amount,
      remark: command.remark,
      idempotencyKey: command.idempotencyKey ?? newIdempotencyKey('ar'),
    })
    receivablesRaw.value = [normalizeReceivable(created), ...receivablesRaw.value]
    return {
      id: String(created.id),
      statementNo: created.statementNo,
      customerId: String(created.customerId),
      accountingMonth: created.accountingMonth,
      statementDate: created.statementDate,
      dueDate: created.dueDate,
      originalAmount: created.originalAmount,
      remark: created.remark,
      createdAt: created.createdAt ?? '',
    }
  }

  /** 核销方案预览（不落库） */
  async function previewReceiptAllocation(command: PreviewReceiptAllocationCommand): Promise<AllocationPreview> {
    const preview = await receivableApi.previewReceiptAllocation({
      customerId: Number(command.customerId),
      actualAmount: command.actualAmount,
      allocations: command.allocations.map((item) => ({
        receivableId: Number(item.receivableId),
        amount: item.allocationAmount,
      })),
    })
    return mapPreview(preview)
  }

  /** 按到期日自动分配（不落库） */
  async function autoAllocateReceipt(command: {
    customerId: EntityId
    actualAmount: DecimalString
  }): Promise<AllocationPreview> {
    const preview = await receivableApi.autoAllocateReceipt({
      customerId: Number(command.customerId),
      actualAmount: command.actualAmount,
    })
    return mapPreview(preview)
  }

  /** 确认前校验（返回业务错误列表，空数组表示可确认） */
  async function validateReceiptAllocation(command: ConfirmReceiptCommand): Promise<BusinessError[]> {
    const errors = await receivableApi.validateReceipt({
      customerId: Number(command.customerId),
      receiptDate: command.receiptDate,
      accountId: Number(command.accountId),
      actualAmount: command.actualAmount,
      externalRef: command.externalRef,
      remark: command.remark,
      allocations: command.allocations.map((item) => ({
        receivableId: Number(item.receivableId),
        amount: item.allocationAmount,
      })),
      idempotencyKey: command.idempotencyKey,
    })
    return errors.map((item) => ({ code: item.code as BusinessError['code'], message: item.message }))
  }

  /** 确认收款：收款单 + 资金流入 + 核销明细同事务提交 */
  async function confirmReceipt(command: ConfirmReceiptCommand): Promise<Receipt> {
    const created = await receivableApi.createReceipt({
      customerId: Number(command.customerId),
      receiptDate: command.receiptDate,
      accountId: Number(command.accountId),
      actualAmount: command.actualAmount,
      externalRef: command.externalRef,
      remark: command.remark,
      allocations: command.allocations.map((item) => ({
        receivableId: Number(item.receivableId),
        amount: item.allocationAmount,
      })),
      idempotencyKey: command.idempotencyKey,
    })
    receiptsRaw.value = [normalizeReceipt(created), ...receiptsRaw.value]
    await refreshReceivables()
    return {
      id: String(created.id),
      receiptNo: created.receiptNo,
      customerId: String(created.customerId),
      receiptDate: created.receiptDate,
      accountId: String(created.accountId),
      actualAmount: created.actualAmount,
      fundTransactionId: created.fundTransactionId === null ? '' : String(created.fundTransactionId),
      externalRef: created.externalRef,
      remark: created.remark,
      idempotencyKey: command.idempotencyKey,
    }
  }

  /** 撤销收款单（后端保留原单据与核销明细，反向流水冲回资金） */
  async function voidReceipt(id: EntityId, voidDate: LocalDate, reason?: string): Promise<void> {
    await receivableApi.voidReceipt(id, voidDate, reason)
    await refreshReceivables()
  }

  /** 撤销应收单（已有核销时后端拒绝） */
  async function voidReceivable(id: EntityId, voidDate: LocalDate, reason?: string): Promise<void> {
    await receivableApi.voidReceivable(id, voidDate, reason)
    receivablesRaw.value = receivablesRaw.value.filter((row) => String(row.id) !== String(id))
  }

  async function refreshReceivables(): Promise<void> {
    const [receivablePage, receiptPage] = await Promise.all([
      receivableApi.listReceivables({ page: 1, size: 500 }),
      receivableApi.listReceipts({ page: 1, size: 500 }),
    ])
    receivablesRaw.value = receivablePage.items.map(normalizeReceivable)
    receiptsRaw.value = receiptPage.items.map(normalizeReceipt)
  }

  return {
    today,
    loading,
    loadError,
    customers,
    fundAccounts,
    receivables,
    receipts,
    receiptAllocations,
    receivableViews,
    accountBalanceViews,
    customerById,
    accountById,
    receivableViewById,
    receiptDetailById,
    transactionNoOfReceipt,
    statementNoOf,
    load,
    listReceivables,
    listReceipts,
    getReceivableById,
    listReceivableAllocations,
    getReceiptById,
    createReceivable,
    previewReceiptAllocation,
    autoAllocateReceipt,
    validateReceiptAllocation,
    confirmReceipt,
    voidReceipt,
    voidReceivable,
    refreshReceivables,
  }
})

function mapAccount(account: ApiFundAccount): FundAccount {
  return {
    id: String(account.id),
    name: account.name,
    accountType: account.accountType,
    openingBalance: account.openingBalance,
    enabled: account.status === 'ENABLED',
  }
}

function mapPreview(preview: ApiAllocationPreview): AllocationPreview {
  return {
    allocations: preview.allocations.map((item) => ({
      receivableId: String(item.receivableId),
      allocationAmount: item.amount,
    })),
    totalAllocated: preview.totalAllocated,
    unallocated: preview.unallocated,
    validationErrors: preview.errors.map((item) => ({
      code: item.code as BusinessError['code'],
      message: item.message,
    })),
  }
}

/** 供回款页面复用：资金流水号展示（避免页面直连 API） */
export function receiptFlowNo(receipt: ReceiptRecord): string | null {
  return receipt.fundTransactionNo ?? null
}

/** 供页面复用：资金账户列表（下拉） */
export async function loadFundAccounts(): Promise<ApiFundAccount[]> {
  const result = await masterdataApi.listAccounts({ page: 1, size: 500 })
  return result.items
}

/** 供页面复用：应收余额（经营概览） */
export async function fetchReceivableBalance(): Promise<{
  outstanding: DecimalString
  overdueOutstanding: DecimalString
}> {
  const balance = await receivableApi.fetchReceivableBalance()
  return { outstanding: balance.outstanding, overdueOutstanding: balance.overdueOutstanding }
}

/** 资金账户接口（避免页面直接引用 treasuryApi 的账户查询） */
export const businessAccountApi = {
  list: loadFundAccounts,
  transactions: (query: Parameters<typeof treasuryApi.listFundTransactions>[0]) =>
    treasuryApi.listFundTransactions(query),
}

/* ---------------------- API 行归一化（后端 id 为数值 → 前端字符串标识） ---------------------- */

function normalizeReceivable(row: ReceivableRecord): ReceivableRecord {
  return { ...row, id: String(row.id), customerId: String(row.customerId) }
}

function normalizeReceipt(row: ReceiptRecord): ReceiptRecord {
  return {
    ...row,
    id: String(row.id),
    customerId: String(row.customerId),
    accountId: String(row.accountId),
    fundTransactionId: row.fundTransactionId === null ? null : String(row.fundTransactionId),
    allocations: row.allocations.map((allocation) => ({
      ...allocation,
      id: String(allocation.id),
      receiptId: String(allocation.receiptId),
      receivableId: String(allocation.receivableId),
    })),
  }
}