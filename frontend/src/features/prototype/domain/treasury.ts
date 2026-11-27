/**
 * 资金账户规则（纯函数）：余额重算、内部转账成对流水构建。
 *
 * 红线：
 * - 账户余额 = 期初余额 + Σ 有效流入 − Σ 有效流出（RECORDED 参与、VOIDED 不参与），
 *   余额必须可重算，禁止硬编码余额；
 * - 单条流水金额恒为正数，方向由 direction 表达；
 * - 内部转账一次性构建两条关联流水（OUT + IN 同额、同 transferGroupId），
 *   转账整体净变化为 0，不产生营业收入/费用。
 */

import { addAmounts, subtractAmounts, type DecimalString } from '@/utils/decimal'
import { normalizeAmount } from '@/utils/money'
import type {
  EntityId,
  FundAccount,
  FundTransaction,
  IsoDateTime,
  LocalDate,
} from '../contracts'
import { canonicalAmount2 } from './amounts'
import { isValidLocalDate } from './dateRules'

/**
 * 重算单个资金账户余额：
 * openingBalance + Σ(RECORDED 且 IN) − Σ(RECORDED 且 OUT)（仅该账户流水）。
 */
export function recomputeAccountBalance(
  account: FundAccount,
  transactions: FundTransaction[],
): DecimalString {
  let balance = account.openingBalance
  for (const txn of transactions) {
    if (txn.accountId !== account.id || txn.status !== 'RECORDED') {
      continue
    }
    balance =
      txn.direction === 'IN' ? addAmounts(balance, txn.amount) : subtractAmounts(balance, txn.amount)
  }
  return canonicalAmount2(balance)
}

/** 一组流水的净现金变化（Σ IN − Σ OUT，仅 RECORDED；内部转账成对流水净变化为 0） */
export function netCashChange(transactions: FundTransaction[]): DecimalString {
  let net: DecimalString = '0'
  for (const txn of transactions) {
    if (txn.status !== 'RECORDED') {
      continue
    }
    net = txn.direction === 'IN' ? addAmounts(net, txn.amount) : subtractAmounts(net, txn.amount)
  }
  return canonicalAmount2(net)
}

/** 内部转账成对流水构建参数 */
export interface InternalTransferPairDraft {
  /** 转账关联 ID（两条流水共享） */
  transferGroupId: EntityId
  /** 转出账户 */
  fromAccountId: EntityId
  /** 转入账户 */
  toAccountId: EntityId
  /** 转账金额（正数） */
  amount: DecimalString
  /** 业务日期 */
  tradeDate: LocalDate
  /** 转出流水编号 */
  outTransactionNo: string
  /** 转入流水编号 */
  inTransactionNo: string
  /** 转出流水 ID */
  outId: EntityId
  /** 转入流水 ID */
  inId: EntityId
  /** 创建时间 */
  createdAt: IsoDateTime
  /** 转出方展示的对手方（转入账户名） */
  outCounterparty: string | null
  /** 转入方展示的对手方（转出账户名） */
  inCounterparty: string | null
  /** 备注（两条流水一致） */
  remark: string | null
}

/**
 * 一次性构建内部转账的两条关联流水（OUT + IN 同额、同 transferGroupId、同 tradeDate）。
 * 转账整体净变化为 0（netCashChange([out, in]) === '0.00'）。
 */
export function buildInternalTransferPair(
  draft: InternalTransferPairDraft,
): [FundTransaction, FundTransaction] {
  const amount = normalizeAmount(draft.amount)
  if (amount === null || amount === '0' || amount.startsWith('-')) {
    throw new Error(`内部转账金额非法: ${draft.amount}`)
  }
  if (draft.fromAccountId === draft.toAccountId) {
    throw new Error('内部转账的转出/转入账户必须不同')
  }
  if (!isValidLocalDate(draft.tradeDate)) {
    throw new Error(`内部转账业务日期非法: ${draft.tradeDate}`)
  }
  const canonical = canonicalAmount2(amount)
  const out: FundTransaction = {
    id: draft.outId,
    transactionNo: draft.outTransactionNo,
    transactionType: 'INTERNAL_TRANSFER',
    tradeDate: draft.tradeDate,
    accountId: draft.fromAccountId,
    direction: 'OUT',
    amount: canonical,
    counterparty: draft.outCounterparty,
    sourceDocType: 'INTERNAL_TRANSFER',
    sourceDocId: draft.transferGroupId,
    transferGroupId: draft.transferGroupId,
    status: 'RECORDED',
    remark: draft.remark,
    createdAt: draft.createdAt,
  }
  const into: FundTransaction = {
    id: draft.inId,
    transactionNo: draft.inTransactionNo,
    transactionType: 'INTERNAL_TRANSFER',
    tradeDate: draft.tradeDate,
    accountId: draft.toAccountId,
    direction: 'IN',
    amount: canonical,
    counterparty: draft.inCounterparty,
    sourceDocType: 'INTERNAL_TRANSFER',
    sourceDocId: draft.transferGroupId,
    transferGroupId: draft.transferGroupId,
    status: 'RECORDED',
    remark: draft.remark,
    createdAt: draft.createdAt,
  }
  return [out, into]
}
