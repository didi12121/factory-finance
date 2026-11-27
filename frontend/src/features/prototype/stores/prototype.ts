/**
 * usePrototypeStore —— Prototype Engine 唯一 Pinia Store（单一业务数据源）。
 *
 * 演示数据隔离说明：
 * - 仅开发/测试环境使用（虚构演示数据），不请求任何后端、不持久化；
 * - 页面刷新 / Store 重建时恢复 `createInitialPrototypeState()` 的初始数据
 *   （跨模块验证场景可重复），也可调用 `resetDemoData()` 手动恢复；
 * - Dashboard / 资金流水 / 应收 / 收款各页面**禁止各自持有数据副本**，
 *   一律经本 Store 读取（state 集合 + 派生查询 + repository 语义方法）。
 *
 * 写操作红线（MemoryPrototypeRepository 保证）：
 * - `confirmReceipt` 原子确认：收款单 ×1 + 资金流入流水 ×1 + 核销明细 ×N 一次性提交，
 *   失败零状态变化；幂等键去重（同键同参返回原结果、同键不同参数 CONFLICT 拒绝）；
 * - 一笔收款只产生一条资金流入；核销不产生新资金流水；禁止物理删除已确认记录；
 * - 账户余额不缓存（由流水重算）；应收已收/未收/状态/逾期一律由核销明细派生。
 *
 * 金额红线：全部金额为 DecimalString，运算走 utils/decimal.ts（BigInt 定点），
 * 禁止 parseFloat / Number / Math.round 参与财务计算、汇总、排序。
 */

import { computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import type { DecimalString } from '@/utils/decimal'
import type {
  AllocationPreview,
  AutoAllocateReceiptCommand,
  BusinessError,
  ConfirmReceiptCommand,
  CreateReceivableCommand,
  Customer,
  CustomerListQuery,
  DashboardPeriod,
  DashboardSummary,
  EntityId,
  FundAccount,
  FundAccountListQuery,
  FundTransaction,
  FundTransactionListQuery,
  PageResult,
  PreviewReceiptAllocationCommand,
  Receipt,
  ReceiptAllocation,
  ReceiptDetail,
  ReceiptListQuery,
  Receivable,
  ReceivableListQuery,
  ReceivableView,
} from '../contracts'
import { createInitialPrototypeState } from '../data/fixtures'
import { canonicalAmount2, sumAmounts } from '../domain/amounts'
import { buildReceivableView, buildReceivableViews } from '../domain/receivable'
import { DEFAULT_DASHBOARD_PERIOD, computeDashboardSummary } from '../domain/reporting'
import { recomputeAccountBalance } from '../domain/treasury'
import { MemoryPrototypeRepository } from '../repository/memoryPrototypeRepository'
import type { PrototypeState } from '../repository/state'

/** 资金账户余额视图（账户 + 重算余额；余额不缓存，可与流水重算对账） */
export interface AccountBalanceView {
  account: FundAccount
  balance: DecimalString
}

export const usePrototypeStore = defineStore('prototype', () => {
  /** 唯一业务状态（客户/账户/流水/应收/收款/核销 + 幂等索引） */
  const state = reactive<PrototypeState>(createInitialPrototypeState())
  /** 内存仓储（同事务语义、幂等；与 state 同源，不产生第二份数据） */
  const repository = new MemoryPrototypeRepository(state)

  /* ---------------------------- 派生查询（只读） ---------------------------- */

  const customers = computed<Customer[]>(() => state.customers.map((item) => ({ ...item })))
  const fundAccounts = computed<FundAccount[]>(() => state.fundAccounts.map((item) => ({ ...item })))
  const fundTransactions = computed<FundTransaction[]>(() =>
    state.fundTransactions.map((item) => ({ ...item })),
  )
  const receivables = computed<Receivable[]>(() => state.receivables.map((item) => ({ ...item })))
  const receipts = computed<Receipt[]>(() => state.receipts.map((item) => ({ ...item })))
  const receiptAllocations = computed<ReceiptAllocation[]>(() =>
    state.receiptAllocations.map((item) => ({ ...item })),
  )

  /** 应收组合视图（实体 + 派生统计，按对账日期倒序 → id 倒序） */
  const receivableViews = computed<ReceivableView[]>(() =>
    buildReceivableViews(state.receivables, state.receiptAllocations).sort((a, b) => {
      if (a.receivable.statementDate !== b.receivable.statementDate) {
        return a.receivable.statementDate < b.receivable.statementDate ? 1 : -1
      }
      return a.receivable.id < b.receivable.id ? 1 : a.receivable.id > b.receivable.id ? -1 : 0
    }),
  )

  /** 账户余额视图（期初 + 有效 IN − 有效 OUT，随时可由流水重算） */
  const accountBalanceViews = computed<AccountBalanceView[]>(() =>
    state.fundAccounts.map((account) => ({
      account: { ...account },
      balance: recomputeAccountBalance(account, state.fundTransactions),
    })),
  )

  /** 当前资金余额（Σ 所有账户重算余额，不因期间筛选变化） */
  const totalFundBalance = computed<DecimalString>(() =>
    canonicalAmount2(sumAmounts(accountBalanceViews.value.map((item) => item.balance))),
  )

  /** 看板汇总（默认期间：2026-11 整月） */
  const dashboardSummary = computed<DashboardSummary>(() =>
    computeDashboardSummary(
      {
        fundAccounts: state.fundAccounts,
        fundTransactions: state.fundTransactions,
        receivables: state.receivables,
        receipts: state.receipts,
        receiptAllocations: state.receiptAllocations,
      },
      DEFAULT_DASHBOARD_PERIOD,
    ),
  )

  /* ---------------------------- 同步定位查询 ---------------------------- */

  function customerById(id: EntityId): Customer | null {
    const found = state.customers.find((item) => item.id === id)
    return found === undefined ? null : { ...found }
  }

  function accountById(id: EntityId): FundAccount | null {
    const found = state.fundAccounts.find((item) => item.id === id)
    return found === undefined ? null : { ...found }
  }

  function receivableViewById(id: EntityId): ReceivableView | null {
    const found = state.receivables.find((item) => item.id === id)
    return found === undefined ? null : buildReceivableView(found, state.receiptAllocations)
  }

  function receiptDetailById(id: EntityId): ReceiptDetail | null {
    const receipt = state.receipts.find((item) => item.id === id)
    if (receipt === undefined) {
      return null
    }
    const allocations = state.receiptAllocations.filter((item) => item.receiptId === id)
    return {
      receipt: { ...receipt },
      allocations: allocations.map((item) => ({ ...item })),
    }
  }

  function accountBalanceOf(accountId: EntityId): DecimalString | null {
    const account = state.fundAccounts.find((item) => item.id === accountId)
    return account === undefined ? null : recomputeAccountBalance(account, state.fundTransactions)
  }

  /* ---------------------------- repository 语义方法 ---------------------------- */

  async function listCustomers(query: CustomerListQuery): Promise<PageResult<Customer>> {
    return repository.listCustomers(query)
  }

  async function listFundAccounts(query: FundAccountListQuery): Promise<PageResult<FundAccount>> {
    return repository.listFundAccounts(query)
  }

  async function listFundTransactions(
    query: FundTransactionListQuery,
  ): Promise<PageResult<FundTransaction>> {
    return repository.listFundTransactions(query)
  }

  async function listReceivables(query: ReceivableListQuery): Promise<PageResult<ReceivableView>> {
    return repository.listReceivables(query)
  }

  async function getReceivableById(id: EntityId): Promise<ReceivableView | null> {
    return repository.getReceivableById(id)
  }

  async function listReceivableAllocations(receivableId: EntityId): Promise<ReceiptAllocation[]> {
    return repository.listReceivableAllocations(receivableId)
  }

  async function listReceipts(query: ReceiptListQuery): Promise<PageResult<Receipt>> {
    return repository.listReceipts(query)
  }

  async function getReceiptById(id: EntityId): Promise<ReceiptDetail | null> {
    return repository.getReceiptById(id)
  }

  async function getDashboardSummary(period: DashboardPeriod): Promise<DashboardSummary> {
    return repository.getDashboardSummary(period)
  }

  /** 新建应收单（不增加现金 / 不建收款单 / 不建流水 / 不自动结清） */
  async function createReceivable(command: CreateReceivableCommand): Promise<Receivable> {
    return repository.createReceivable(command)
  }

  /** 核销方案预览（不落状态） */
  async function previewReceiptAllocation(
    command: PreviewReceiptAllocationCommand,
  ): Promise<AllocationPreview> {
    return repository.previewReceiptAllocation(command)
  }

  /** 自动核销建议（只预览不落状态） */
  async function autoAllocateReceipt(
    command: AutoAllocateReceiptCommand,
  ): Promise<AllocationPreview> {
    return repository.autoAllocateReceipt(command)
  }

  /** 确认前校验（空数组表示可确认） */
  async function validateReceiptAllocation(
    command: ConfirmReceiptCommand,
  ): Promise<BusinessError[]> {
    return repository.validateReceiptAllocation(command)
  }

  /** 确认收款（原子 + 幂等；校验失败零状态变化） */
  async function confirmReceipt(command: ConfirmReceiptCommand): Promise<Receipt> {
    return repository.confirmReceipt(command)
  }

  /** 恢复演示数据初始状态（页面刷新等价；跨模块验证场景可重复） */
  function resetDemoData(): void {
    const fresh = createInitialPrototypeState()
    state.customers = fresh.customers
    state.fundAccounts = fresh.fundAccounts
    state.fundTransactions = fresh.fundTransactions
    state.receivables = fresh.receivables
    state.receipts = fresh.receipts
    state.receiptAllocations = fresh.receiptAllocations
    state.idempotencyRecords = fresh.idempotencyRecords
  }

  return {
    // 派生查询
    customers,
    fundAccounts,
    fundTransactions,
    receivables,
    receipts,
    receiptAllocations,
    receivableViews,
    accountBalanceViews,
    totalFundBalance,
    dashboardSummary,
    // 同步定位查询
    customerById,
    accountById,
    receivableViewById,
    receiptDetailById,
    accountBalanceOf,
    // repository 语义方法
    listCustomers,
    listFundAccounts,
    listFundTransactions,
    listReceivables,
    getReceivableById,
    listReceivableAllocations,
    listReceipts,
    getReceiptById,
    getDashboardSummary,
    createReceivable,
    previewReceiptAllocation,
    autoAllocateReceipt,
    validateReceiptAllocation,
    confirmReceipt,
    // 演示数据维护
    resetDemoData,
  }
})
