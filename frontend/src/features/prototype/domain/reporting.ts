/**
 * 看板统计规则（纯函数）：DashboardSummary 派生计算。
 *
 * 业务与财务分离（红线）：
 * - 当前资金余额 = Σ 所有账户重算余额（期初 + 有效 IN − 有效 OUT），**不因期间筛选变化**；
 * - 当前应收余额 = Σ 未收金额；逾期应收余额 = Σ 逾期且未收金额（DEMO_TODAY 基准）；
 * - 期间加工收入 = 权责发生制（按应收单 accountingMonth 归属整月计入，不按天摊分），
 *   **≠ 实际回款**；股东出资不计收入；
 * - 期间实际回款按 Receipt.receiptDate、期间实际支出按 FundTransaction.tradeDate（资金事实）；
 * - 资金收付趋势按日聚合外部收付（**内部转账不计入外部收付趋势**）；
 * - 支出分类按业务类型聚合（SALARY / UTILITIES / PURCHASE / OTHER），
 *   内部转账不是支出。
 *
 * 全部金额用 utils/decimal.ts 精确累加（addAmounts），输出规范化两位小数。
 */

import { compareAmounts, type DecimalString } from '@/utils/decimal'
import {
  DEMO_TODAY,
  type CashFlowTrendPoint,
  type DashboardPeriod,
  type DashboardSummary,
  type ExpenseCategoryStat,
  type FundAccount,
  type FundTransaction,
  type Receipt,
  type ReceiptAllocation,
  type Receivable,
  type ReceivableView,
  type TransactionType,
} from '../contracts'
import { canonicalAmount2, sumAmounts } from './amounts'
import { isAccountingMonthInPeriod, isDateInRange } from './dateRules'
import { buildReceivableView, compareReceivableUrgency } from './receivable'
import { recomputeAccountBalance } from './treasury'

/** 默认看板统计期间（2026-11 整月，与 DEMO_TODAY 同月） */
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = { from: '2026-11-01', to: '2026-11-30' }

/** 近期资金流水条数（实现约定值） */
export const RECENT_TRANSACTION_LIMIT = 10

/** 看板计算所需的只读状态切片 */
export interface DashboardSourceState {
  fundAccounts: FundAccount[]
  fundTransactions: FundTransaction[]
  receivables: Receivable[]
  receipts: Receipt[]
  receiptAllocations: ReceiptAllocation[]
}

/** 支出分类固定顺序（仅输出有发生额的分类） */
const EXPENSE_CATEGORIES: TransactionType[] = ['SALARY', 'UTILITIES', 'PURCHASE', 'OTHER']

/** 外部收付流水（RECORDED 且非内部转账）：收付趋势与实际支出统计口径 */
function isExternalCashFlow(txn: FundTransaction): boolean {
  return txn.status === 'RECORDED' && txn.transactionType !== 'INTERNAL_TRANSFER'
}

/** 期间实际支出流水（外部流出，资金事实） */
function isPeriodExpense(txn: FundTransaction, period: DashboardPeriod): boolean {
  return isExternalCashFlow(txn) && txn.direction === 'OUT' && isDateInRange(txn.tradeDate, period)
}

/**
 * 计算看板汇总（派生统计）。
 * 余额类指标为「当前余额」，不因期间筛选变成期间发生额。
 */
export function computeDashboardSummary(
  source: DashboardSourceState,
  period: DashboardPeriod,
): DashboardSummary {
  // 当前资金余额：Σ 所有账户重算余额（含停用账户，余额仍属资金），与期间无关
  const totalFundBalance = canonicalAmount2(
    sumAmounts(source.fundAccounts.map((account) => recomputeAccountBalance(account, source.fundTransactions))),
  )

  const views: ReceivableView[] = source.receivables.map((receivable) =>
    buildReceivableView(receivable, source.receiptAllocations),
  )
  const totalReceivableOutstanding = canonicalAmount2(
    sumAmounts(views.map((view) => view.summary.outstandingAmount)),
  )
  const overdueReceivableOutstanding = canonicalAmount2(
    sumAmounts(
      views
        .filter((view) => view.summary.isOverdue)
        .map((view) => view.summary.outstandingAmount),
    ),
  )

  // 期间加工收入：权责发生制，按 accountingMonth 归属（整月计入一次，不按天摊分）
  const periodProcessingFeeIncome = canonicalAmount2(
    sumAmounts(
      source.receivables
        .filter((receivable) => isAccountingMonthInPeriod(receivable.accountingMonth, period))
        .map((receivable) => receivable.originalAmount),
    ),
  )

  // 期间实际回款：资金事实，按收款单实际到账日期
  const periodActualReceipts = canonicalAmount2(
    sumAmounts(
      source.receipts
        .filter((receipt) => isDateInRange(receipt.receiptDate, period))
        .map((receipt) => receipt.actualAmount),
    ),
  )

  // 期间实际支出：外部流出（内部转账不计入），按业务发生日期
  const expenseTransactions = source.fundTransactions.filter((txn) => isPeriodExpense(txn, period))
  const periodActualExpenses = canonicalAmount2(
    sumAmounts(expenseTransactions.map((txn) => txn.amount)),
  )

  // 资金收付趋势：按日聚合外部收付（含股东出资流入；内部转账不计入外部收付趋势）
  const trendByDate = new Map<string, { inflow: DecimalString; outflow: DecimalString }>()
  for (const txn of source.fundTransactions) {
    if (!isExternalCashFlow(txn) || !isDateInRange(txn.tradeDate, period)) {
      continue
    }
    const bucket = trendByDate.get(txn.tradeDate) ?? { inflow: '0', outflow: '0' }
    if (txn.direction === 'IN') {
      bucket.inflow = sumAmounts([bucket.inflow, txn.amount])
    } else {
      bucket.outflow = sumAmounts([bucket.outflow, txn.amount])
    }
    trendByDate.set(txn.tradeDate, bucket)
  }
  const cashFlowTrend: CashFlowTrendPoint[] = [...trendByDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, bucket]) => ({
      date,
      inflow: canonicalAmount2(bucket.inflow),
      outflow: canonicalAmount2(bucket.outflow),
    }))

  // 支出分类：按业务类型聚合（仅输出有发生额的分类，固定顺序）
  const expenseBreakdown: ExpenseCategoryStat[] = []
  for (const category of EXPENSE_CATEGORIES) {
    const amount = canonicalAmount2(
      sumAmounts(
        expenseTransactions
          .filter((txn) => txn.transactionType === category)
          .map((txn) => txn.amount),
      ),
    )
    if (compareAmounts(amount, '0') > 0) {
      expenseBreakdown.push({ category, amount })
    }
  }

  // 近期资金流水：业务日期倒序（仅有效流水），条数由实现约定
  const recentTransactions = [...source.fundTransactions]
    .filter((txn) => txn.status === 'RECORDED')
    .sort((a, b) => {
      if (a.tradeDate !== b.tradeDate) {
        return a.tradeDate < b.tradeDate ? 1 : -1
      }
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1
      }
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    })
    .slice(0, RECENT_TRANSACTION_LIMIT)

  // 待收单据：未结清应收（含派生统计），紧迫度顺序
  const pendingReceivables = views
    .filter((view) => compareAmounts(view.summary.outstandingAmount, '0') > 0)
    .sort((a, b) => compareReceivableUrgency(a.receivable, b.receivable))

  return {
    asOf: DEMO_TODAY,
    period,
    totalFundBalance,
    totalReceivableOutstanding,
    periodProcessingFeeIncome,
    periodActualReceipts,
    periodActualExpenses,
    cashFlowTrend,
    expenseBreakdown,
    recentTransactions,
    pendingReceivables,
    overdueReceivableOutstanding,
  }
}
