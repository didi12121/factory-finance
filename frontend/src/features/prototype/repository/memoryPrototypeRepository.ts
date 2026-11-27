/**
 * PrototypeRepository 内存实现（Mock Store 数据访问层）。
 *
 * 演示数据隔离说明：
 * - 仅开发/测试环境使用（虚构演示数据），不请求任何后端、不持久化；
 * - 页面刷新 / Store 重建时经 `createInitialPrototypeState()` 恢复初始数据；
 * - 写操作红线：同事务语义一次性提交、幂等（idempotencyKey 去重）、
 *   一笔收款只产生一条资金流入、核销不产生新资金流水、禁止物理删除已确认记录、
 *   失败操作零状态变化（先全量校验、后一次性提交）。
 *
 * 金额红线：全部金额运算走 utils/decimal.ts（BigInt 定点）+ utils/money.ts 校验，
 * 禁止 parseFloat / Number / Math.round 参与财务计算、汇总、排序。
 * 账户余额不缓存：一律由 `recomputeAccountBalance` 从流水重算（禁止硬编码余额）。
 */

import { compareAmounts } from '@/utils/decimal'
import { normalizeAmount } from '@/utils/money'
import {
  DEMO_TODAY,
  type AllocationPreview,
  type AutoAllocateReceiptCommand,
  type BusinessError,
  type ConfirmReceiptCommand,
  type CreateReceivableCommand,
  type Customer,
  type CustomerListQuery,
  type DashboardPeriod,
  type DashboardSummary,
  type EntityId,
  type FundAccount,
  type FundAccountListQuery,
  type FundTransaction,
  type FundTransactionListQuery,
  type IsoDateTime,
  type PageQuery,
  type PageResult,
  type PreviewReceiptAllocationCommand,
  type PrototypeRepository,
  type Receipt,
  type ReceiptAllocation,
  type ReceiptDetail,
  type ReceiptListQuery,
  type Receivable,
  type ReceivableListQuery,
  type ReceivableView,
  type SortDirection,
} from '../contracts'
import {
  autoAllocateReceipt,
  previewReceiptAllocation,
  validateReceiptAllocation,
  type AllocationContext,
} from '../domain/allocation'
import { canonicalAmount2 } from '../domain/amounts'
import { isValidAccountingMonth, isValidLocalDate } from '../domain/dateRules'
import { buildReceivableView, buildReceivableViews } from '../domain/receivable'
import { computeDashboardSummary } from '../domain/reporting'
import {
  canonicalReceiptCommandParams,
  hashReceiptCommandParams,
  normalizeIdempotencyKey,
} from './idempotency'
import { PrototypeBusinessError } from './prototypeErrors'
import {
  getIdempotencyRecord,
  setIdempotencyRecord,
  type PrototypeState,
} from './state'

/* ---------------------------------- 通用工具 ---------------------------------- */

function cloneEntity<T extends object>(item: T): T {
  return { ...item }
}

function bizError(code: BusinessError['code'], message: string, fieldErrors?: Record<string, string>): BusinessError {
  return fieldErrors === undefined ? { code, message } : { code, message, fieldErrors }
}

function matchesKeyword(keyword: string | undefined, fields: Array<string | null>): boolean {
  if (keyword === undefined || keyword.trim() === '') {
    return true
  }
  const needle = keyword.trim().toLowerCase()
  return fields.some((field) => field !== null && field.toLowerCase().includes(needle))
}

function validatePageQuery(query: PageQuery): void {
  const errors: BusinessError[] = []
  if (!Number.isInteger(query.page) || query.page < 1) {
    errors.push(bizError('VALIDATION_ERROR', '分页参数 page 必须为 ≥ 1 的整数'))
  }
  if (!Number.isInteger(query.size) || query.size < 1 || query.size > 500) {
    errors.push(bizError('VALIDATION_ERROR', '分页参数 size 必须为 1–500 的整数'))
  }
  if (errors.length > 0) {
    throw new PrototypeBusinessError(errors)
  }
}

function paginate<T>(items: T[], query: PageQuery, clone: (item: T) => T): PageResult<T> {
  validatePageQuery(query)
  const start = (query.page - 1) * query.size
  return {
    items: items.slice(start, start + query.size).map(clone),
    total: items.length,
    page: query.page,
    size: query.size,
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 可空字符串比较（null 排在最后） */
function compareNullableStrings(a: string | null, b: string | null): number {
  if (a === null && b === null) {
    return 0
  }
  if (a === null) {
    return 1
  }
  if (b === null) {
    return -1
  }
  return compareStrings(a, b)
}

function applyDirection(value: number, direction: SortDirection): number {
  return direction === 'DESC' ? -value : value
}

function withIdTiebreak<T extends { id: EntityId }>(primary: number, a: T, b: T): number {
  return primary !== 0 ? primary : compareStrings(a.id, b.id)
}

/* ---------------------------------- 单据编号/审计时间 ---------------------------------- */

function nextSequence(values: string[], pattern: RegExp): number {
  let max = 0
  for (const value of values) {
    const match = pattern.exec(value)
    if (match !== null) {
      const captured = match[1]
      if (captured !== undefined) {
        const parsed = Number.parseInt(captured, 10)
        if (parsed > max) {
          max = parsed
        }
      }
    }
  }
  return max + 1
}

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/**
 * 演示审计时间（确定性）：以 DEMO_TODAY 08:00 为基准按已生成行数递增分钟。
 * 不使用真实当前时间，保证演示数据可重放、断言稳定。
 */
function demoAuditTime(offsetMinutes: number): IsoDateTime {
  const totalMinutes = 8 * 60 + offsetMinutes
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return `${DEMO_TODAY}T${hh}:${mm}:00`
}

/* ---------------------------------- Repository 实现 ---------------------------------- */

/**
 * 内存版 PrototypeRepository（持有唯一业务状态）。
 * Pinia Store（stores/prototype.ts）持有本实现的单例作为单一数据源。
 */
export class MemoryPrototypeRepository implements PrototypeRepository {
  constructor(private readonly state: PrototypeState) {}

  /** 暴露底层状态（Store/测试用；页面层禁止直接改写） */
  getState(): PrototypeState {
    return this.state
  }

  private context(): AllocationContext {
    return {
      customers: this.state.customers,
      fundAccounts: this.state.fundAccounts,
      receivables: this.state.receivables,
      receiptAllocations: this.state.receiptAllocations,
    }
  }

  private auditOffset(): number {
    return (
      this.state.receivables.length +
      this.state.receipts.length +
      this.state.receiptAllocations.length +
      this.state.fundTransactions.length
    )
  }

  /* ---------------------------- 查询 ---------------------------- */

  async listCustomers(query: CustomerListQuery): Promise<PageResult<Customer>> {
    const filtered = this.state.customers.filter(
      (item) =>
        matchesKeyword(query.keyword, [item.name]) &&
        (query.status === undefined || item.status === query.status),
    )
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (query.sort !== undefined) {
        const primary =
          query.sort.field === 'name'
            ? compareStrings(a.name, b.name)
            : query.sort.field === 'status'
              ? compareStrings(a.status, b.status)
              : compareStrings(a.id, b.id)
        return withIdTiebreak(applyDirection(primary, query.sort.direction), a, b)
      }
      return withIdTiebreak(compareStrings(a.name, b.name), a, b)
    })
    return paginate(sorted, query, cloneEntity)
  }

  async listFundAccounts(query: FundAccountListQuery): Promise<PageResult<FundAccount>> {
    const filtered = this.state.fundAccounts.filter(
      (item) =>
        matchesKeyword(query.keyword, [item.name]) &&
        (query.enabled === undefined || item.enabled === query.enabled),
    )
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (query.sort !== undefined) {
        const primary =
          query.sort.field === 'name'
            ? compareStrings(a.name, b.name)
            : query.sort.field === 'accountType'
              ? compareStrings(a.accountType, b.accountType)
              : query.sort.field === 'openingBalance'
                ? compareAmounts(a.openingBalance, b.openingBalance)
                : compareStrings(a.id, b.id)
        return withIdTiebreak(applyDirection(primary, query.sort.direction), a, b)
      }
      return withIdTiebreak(compareStrings(a.name, b.name), a, b)
    })
    return paginate(sorted, query, cloneEntity)
  }

  async listFundTransactions(query: FundTransactionListQuery): Promise<PageResult<FundTransaction>> {
    const filtered = this.state.fundTransactions.filter(
      (item) =>
        matchesKeyword(query.keyword, [item.transactionNo, item.counterparty, item.remark]) &&
        (query.dateRange === undefined ||
          (item.tradeDate >= (query.dateRange.from ?? item.tradeDate) &&
            item.tradeDate <= (query.dateRange.to ?? item.tradeDate))) &&
        (query.accountId === undefined || item.accountId === query.accountId) &&
        (query.transactionType === undefined || item.transactionType === query.transactionType) &&
        (query.direction === undefined || item.direction === query.direction) &&
        (query.status === undefined || item.status === query.status),
    )
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (query.sort !== undefined) {
        const primary = compareTransactionField(a, b, query.sort.field)
        return withIdTiebreak(applyDirection(primary, query.sort.direction), a, b)
      }
      // 默认排序：业务日期倒序 → 创建时间倒序 → id 倒序
      if (a.tradeDate !== b.tradeDate) {
        return compareStrings(b.tradeDate, a.tradeDate)
      }
      if (a.createdAt !== b.createdAt) {
        return compareStrings(b.createdAt, a.createdAt)
      }
      return compareStrings(b.id, a.id)
    })
    return paginate(sorted, query, cloneEntity)
  }

  async listReceivables(query: ReceivableListQuery): Promise<PageResult<ReceivableView>> {
    const views = buildReceivableViews(this.state.receivables, this.state.receiptAllocations)
    const filtered = views.filter((view) => {
      const customer = this.state.customers.find((item) => item.id === view.receivable.customerId)
      return (
        matchesKeyword(query.keyword, [view.receivable.statementNo, customer?.name ?? null]) &&
        (query.dateRange === undefined ||
          (view.receivable.statementDate >= (query.dateRange.from ?? view.receivable.statementDate) &&
            view.receivable.statementDate <= (query.dateRange.to ?? view.receivable.statementDate))) &&
        (query.customerId === undefined || view.receivable.customerId === query.customerId) &&
        (query.status === undefined || view.summary.status === query.status) &&
        (query.overdueOnly === undefined || !query.overdueOnly || view.summary.isOverdue)
      )
    })
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (query.sort !== undefined) {
        const primary = compareReceivableViewField(a, b, query.sort.field)
        return primary !== 0 ? applyDirection(primary, query.sort.direction) : compareStrings(a.receivable.id, b.receivable.id)
      }
      // 默认排序：对账日期倒序 → 创建时间倒序 → id 倒序
      if (a.receivable.statementDate !== b.receivable.statementDate) {
        return compareStrings(b.receivable.statementDate, a.receivable.statementDate)
      }
      if (a.receivable.createdAt !== b.receivable.createdAt) {
        return compareStrings(b.receivable.createdAt, a.receivable.createdAt)
      }
      return compareStrings(b.receivable.id, a.receivable.id)
    })
    return paginate(sorted, query, cloneReceivableView)
  }

  async getReceivableById(id: EntityId): Promise<ReceivableView | null> {
    const receivable = this.state.receivables.find((item) => item.id === id)
    if (receivable === undefined) {
      return null
    }
    return cloneReceivableView(buildReceivableView(receivable, this.state.receiptAllocations))
  }

  async listReceivableAllocations(receivableId: EntityId): Promise<ReceiptAllocation[]> {
    const allocations = this.state.receiptAllocations
      .filter((item) => item.receivableId === receivableId)
      .sort((a, b) => {
        if (a.allocatedAt !== b.allocatedAt) {
          return compareStrings(a.allocatedAt, b.allocatedAt)
        }
        return compareStrings(a.id, b.id)
      })
    return allocations.map(cloneEntity)
  }

  async listReceipts(query: ReceiptListQuery): Promise<PageResult<Receipt>> {
    const filtered = this.state.receipts.filter(
      (item) =>
        matchesKeyword(query.keyword, [item.receiptNo, item.externalRef, item.remark]) &&
        (query.dateRange === undefined ||
          (item.receiptDate >= (query.dateRange.from ?? item.receiptDate) &&
            item.receiptDate <= (query.dateRange.to ?? item.receiptDate))) &&
        (query.customerId === undefined || item.customerId === query.customerId) &&
        (query.accountId === undefined || item.accountId === query.accountId),
    )
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (query.sort !== undefined) {
        const primary = compareReceiptField(a, b, query.sort.field)
        return withIdTiebreak(applyDirection(primary, query.sort.direction), a, b)
      }
      // 默认排序：到账日期倒序 → id 倒序
      if (a.receiptDate !== b.receiptDate) {
        return compareStrings(b.receiptDate, a.receiptDate)
      }
      return compareStrings(b.id, a.id)
    })
    return paginate(sorted, query, cloneEntity)
  }

  async getReceiptById(id: EntityId): Promise<ReceiptDetail | null> {
    const receipt = this.state.receipts.find((item) => item.id === id)
    if (receipt === undefined) {
      return null
    }
    const allocations = this.state.receiptAllocations
      .filter((item) => item.receiptId === id)
      .sort((a, b) => {
        if (a.allocatedAt !== b.allocatedAt) {
          return compareStrings(a.allocatedAt, b.allocatedAt)
        }
        return compareStrings(a.id, b.id)
      })
    return { receipt: cloneEntity(receipt), allocations: allocations.map(cloneEntity) }
  }

  async getDashboardSummary(period: DashboardPeriod): Promise<DashboardSummary> {
    return computeDashboardSummary(
      {
        fundAccounts: this.state.fundAccounts,
        fundTransactions: this.state.fundTransactions,
        receivables: this.state.receivables,
        receipts: this.state.receipts,
        receiptAllocations: this.state.receiptAllocations,
      },
      period,
    )
  }

  /* ---------------------------- 写操作 ---------------------------- */

  async createReceivable(command: CreateReceivableCommand): Promise<Receivable> {
    const errors = validateCreateReceivableCommand(command, this.state.customers)
    if (errors.length > 0) {
      // 失败操作零状态变化：直接拒绝，不写入任何数据
      throw new PrototypeBusinessError(errors)
    }
    const amount = canonicalAmount2(normalizeAmount(command.amount) ?? '0')
    const year = command.statementDate.slice(0, 4)
    const seq = nextSequence(
      this.state.receivables.map((item) => item.statementNo),
      /^AR-\d{4}-(\d{4})$/,
    )
    const receivable: Receivable = {
      id: `ar-${padNumber(nextSequence(this.state.receivables.map((item) => item.id), /^ar-(\d+)$/), 3)}`,
      statementNo: `AR-${year}-${padNumber(seq, 4)}`,
      customerId: command.customerId,
      accountingMonth: command.accountingMonth,
      statementDate: command.statementDate,
      dueDate: command.dueDate,
      originalAmount: amount,
      remark: command.remark,
      createdAt: demoAuditTime(this.auditOffset()),
    }
    this.state.receivables.push(receivable)
    return cloneEntity(receivable)
  }

  async previewReceiptAllocation(command: PreviewReceiptAllocationCommand): Promise<AllocationPreview> {
    return previewReceiptAllocation(command, this.context())
  }

  async autoAllocateReceipt(command: AutoAllocateReceiptCommand): Promise<AllocationPreview> {
    return autoAllocateReceipt(command, this.context())
  }

  async validateReceiptAllocation(command: ConfirmReceiptCommand): Promise<BusinessError[]> {
    return validateReceiptAllocation(command, this.context())
  }

  /**
   * 确认收款（原子确认，内存一致性）：
   * 读取状态 → 全量校验（含幂等键）→ 构建完整变更（收款单 ×1、资金流入流水 ×1、
   * 核销明细 ×N）→ 一次性提交。任何校验失败：收款单/流水/核销/余额/收入全部不变。
   * 幂等：同键同参（规范化参数串直接比较）重复提交返回原收款单；同键不同参数 CONFLICT 拒绝；
   * 哈希仅作索引优化，不作唯一判据。
   */
  async confirmReceipt(command: ConfirmReceiptCommand): Promise<Receipt> {
    const idempotencyKey = normalizeIdempotencyKey(command.idempotencyKey)
    const canonicalParams = canonicalReceiptCommandParams(command)
    const paramsHash = hashReceiptCommandParams(command)
    const existing = getIdempotencyRecord(this.state.idempotencyRecords, idempotencyKey)
    if (existing !== undefined) {
      // 等价性判据：规范化参数串直接比较（哈希仅索引优化）
      if (existing.canonicalParams !== canonicalParams) {
        throw new PrototypeBusinessError([
          bizError('CONFLICT', '同一幂等键的业务参数不一致，拒绝重复提交', {
            idempotencyKey: '幂等键与既有收款单的业务参数不一致',
          }),
        ])
      }
      const prior = this.state.receipts.find((item) => item.id === existing.receiptId)
      if (prior !== undefined) {
        return cloneEntity(prior)
      }
    }

    const errors = validateReceiptAllocation(command, this.context())
    if (errors.length > 0) {
      // 失败操作零状态变化：收款单/流水/核销/余额/收入全部不变
      throw new PrototypeBusinessError(errors)
    }

    // 校验通过后一次性构建完整变更（一笔收款只产生一条资金流入；核销不产生新流水）
    const customer = this.state.customers.find((item) => item.id === command.customerId)
    const actualAmount = canonicalAmount2(normalizeAmount(command.actualAmount) ?? '0')
    const auditAt: IsoDateTime = demoAuditTime(this.auditOffset())
    const receiptId = `rc-${padNumber(nextSequence(this.state.receipts.map((item) => item.id), /^rc-(\d+)$/), 3)}`
    const receiptSeq = nextSequence(
      this.state.receipts.map((item) => item.receiptNo),
      /^SK-\d{4}-(\d{4})$/,
    )
    const transactionId = `txn-${padNumber(
      nextSequence(this.state.fundTransactions.map((item) => item.id), /^txn-(\d+)$/),
      3,
    )}`
    const transactionSeq = nextSequence(
      this.state.fundTransactions.map((item) => item.transactionNo),
      /^FT-\d{4}-(\d{4})$/,
    )

    const receipt: Receipt = {
      id: receiptId,
      receiptNo: `SK-${command.receiptDate.slice(0, 4)}-${padNumber(receiptSeq, 4)}`,
      customerId: command.customerId,
      receiptDate: command.receiptDate,
      accountId: command.accountId,
      actualAmount,
      fundTransactionId: transactionId,
      externalRef: command.externalRef,
      remark: command.remark,
      idempotencyKey,
    }
    const transaction: FundTransaction = {
      id: transactionId,
      transactionNo: `FT-${command.receiptDate.slice(0, 4)}-${padNumber(transactionSeq, 4)}`,
      transactionType: 'PROCESSING_FEE_RECEIPT',
      tradeDate: command.receiptDate,
      accountId: command.accountId,
      direction: 'IN',
      amount: actualAmount,
      counterparty: customer?.name ?? null,
      sourceDocType: 'RECEIPT',
      sourceDocId: receiptId,
      transferGroupId: null,
      status: 'RECORDED',
      remark: command.remark,
      createdAt: auditAt,
    }
    const allocations: ReceiptAllocation[] = command.allocations.map((draft, index) => ({
      id: `alloc-${padNumber(
        nextSequence(this.state.receiptAllocations.map((item) => item.id), /^alloc-(\d+)$/) + index,
        3,
      )}`,
      receiptId,
      receivableId: draft.receivableId,
      allocationAmount: canonicalAmount2(normalizeAmount(draft.allocationAmount) ?? '0'),
      allocatedAt: auditAt,
    }))

    this.state.receipts.push(receipt)
    this.state.fundTransactions.push(transaction)
    this.state.receiptAllocations.push(...allocations)
    // 幂等索引写入（自有属性写入，'__proto__' 等键不污染原型链）：
    // canonicalParams 直接比较为等价性判据，paramsHash 仅索引优化
    setIdempotencyRecord(this.state.idempotencyRecords, idempotencyKey, {
      receiptId,
      canonicalParams,
      paramsHash,
    })

    return cloneEntity(receipt)
  }
}

/* ---------------------------------- 比较器 ---------------------------------- */

function compareTransactionField(a: FundTransaction, b: FundTransaction, field: string): number {
  switch (field) {
    case 'transactionNo':
      return compareStrings(a.transactionNo, b.transactionNo)
    case 'transactionType':
      return compareStrings(a.transactionType, b.transactionType)
    case 'tradeDate':
      return compareStrings(a.tradeDate, b.tradeDate)
    case 'accountId':
      return compareStrings(a.accountId, b.accountId)
    case 'direction':
      return compareStrings(a.direction, b.direction)
    case 'amount':
      // 金额排序必须用 compareAmounts 精确比较
      return compareAmounts(a.amount, b.amount)
    case 'status':
      return compareStrings(a.status, b.status)
    case 'createdAt':
      return compareStrings(a.createdAt, b.createdAt)
    default:
      return compareStrings(a.id, b.id)
  }
}

function compareReceivableViewField(a: ReceivableView, b: ReceivableView, field: string): number {
  switch (field) {
    case 'statementNo':
      return compareStrings(a.receivable.statementNo, b.receivable.statementNo)
    case 'accountingMonth':
      return compareStrings(a.receivable.accountingMonth, b.receivable.accountingMonth)
    case 'statementDate':
      return compareStrings(a.receivable.statementDate, b.receivable.statementDate)
    case 'dueDate':
      return compareNullableStrings(a.receivable.dueDate, b.receivable.dueDate)
    case 'originalAmount':
      return compareAmounts(a.receivable.originalAmount, b.receivable.originalAmount)
    case 'paidAmount':
      return compareAmounts(a.summary.paidAmount, b.summary.paidAmount)
    case 'outstandingAmount':
      return compareAmounts(a.summary.outstandingAmount, b.summary.outstandingAmount)
    case 'status':
      return compareStrings(a.summary.status, b.summary.status)
    case 'createdAt':
      return compareStrings(a.receivable.createdAt, b.receivable.createdAt)
    default:
      return compareStrings(a.receivable.id, b.receivable.id)
  }
}

function compareReceiptField(a: Receipt, b: Receipt, field: string): number {
  switch (field) {
    case 'receiptNo':
      return compareStrings(a.receiptNo, b.receiptNo)
    case 'customerId':
      return compareStrings(a.customerId, b.customerId)
    case 'receiptDate':
      return compareStrings(a.receiptDate, b.receiptDate)
    case 'accountId':
      return compareStrings(a.accountId, b.accountId)
    case 'actualAmount':
      return compareAmounts(a.actualAmount, b.actualAmount)
    default:
      return compareStrings(a.id, b.id)
  }
}

function cloneReceivableView(view: ReceivableView): ReceivableView {
  return {
    receivable: cloneEntity(view.receivable),
    summary: cloneEntity(view.summary),
  }
}

/* ---------------------------------- 创建应收校验 ---------------------------------- */

/**
 * 新建应收单校验（业务日期语义，按主 Agent 裁决与阶段规范校准）：
 * - 会计期间：格式合法（YYYY-MM）的任意真实公历月份，**含未来月允许创建/登记**；
 * - 对账日期：真实公历日期，**含未来日期允许创建**（DEMO_TODAY 当日亦允许）；
 * - 到期日期：可为未来（仅影响逾期派生），但不得早于对账日期；
 * - 收入确认（阶段规范约束点）：当前原型不支持未来收入确认——未来月/未来确认日期
 *   单据**不得进入截至当前业务日期的已确认收入**（domain/reporting.ts 报告层防御性过滤，
 *   视为未确认/未来期间单据）；
 * - 全部校验先行、失败零状态变化；禁止引入预计收入/预计回款/预收款会计规则。
 */
function validateCreateReceivableCommand(
  command: CreateReceivableCommand,
  customers: Customer[],
): BusinessError[] {
  const errors: BusinessError[] = []

  const customer = customers.find((item) => item.id === command.customerId)
  if (customer === undefined) {
    errors.push(bizError('NOT_FOUND', '客户不存在', { customerId: '客户不存在' }))
  } else if (customer.status !== 'ENABLED') {
    errors.push(bizError('VALIDATION_ERROR', '客户已停用，不可登记新应收单', { customerId: '客户已停用' }))
  }

  if (!isValidAccountingMonth(command.accountingMonth)) {
    errors.push(bizError('VALIDATION_ERROR', '会计期间格式非法（应为 YYYY-MM）', { accountingMonth: '会计期间格式非法' }))
  }
  if (!isValidLocalDate(command.statementDate)) {
    errors.push(bizError('VALIDATION_ERROR', '对账日期格式非法', { statementDate: '对账日期必须为真实存在的 YYYY-MM-DD 日期' }))
  }
  if (command.dueDate !== null) {
    if (!isValidLocalDate(command.dueDate)) {
      errors.push(bizError('VALIDATION_ERROR', '到期日格式非法', { dueDate: '到期日必须为真实存在的 YYYY-MM-DD 日期' }))
    } else if (isValidLocalDate(command.statementDate) && command.dueDate < command.statementDate) {
      errors.push(bizError('VALIDATION_ERROR', '到期日不得早于对账日期', { dueDate: '到期日不得早于对账日期' }))
    }
  }

  const amount = normalizeAmount(command.amount)
  if (amount === null) {
    errors.push(bizError('VALIDATION_ERROR', '应收金额格式非法', { amount: '必须为最多两位小数的十进制金额' }))
  } else if (compareAmounts(amount, '0') <= 0) {
    errors.push(bizError('VALIDATION_ERROR', '应收金额必须大于 0', { amount: '应收金额必须大于 0' }))
  }

  return errors
}
