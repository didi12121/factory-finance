/**
 * 资金流水金额列排序测试（Agent E / P02-E）—— 精确金额排序，含负向比较场景。
 *
 * 红线：金额排序必须使用 compareAmounts（BigInt 定点，amountSortingFn），
 * 禁止按千分位格式化字符串做字典序排序（'900.00' > '1000.00' 数值序 vs 字典序相反）。
 */

import { describe, expect, it } from 'vitest'

import type { Row, SortingFn } from '@tanstack/vue-table'

import { amountSortingFn } from '@/components/shared/tableSorting'
import type { FundTransaction } from '@/features/prototype/contracts'
import { DEMO_FUND_TRANSACTIONS } from '@/features/prototype/data/fixtures'
import { buildTransactionColumns } from './transactionsColumns'
import { incomeSortValue, outcomeSortValue } from './transactionsModel'

const columns = buildTransactionColumns({
  accountName: () => '示例账户',
  receiptNoById: () => null,
  onOpenDetail: () => {},
})

function columnOf(id: string): NonNullable<ReturnType<typeof columns.find>> {
  const column = columns.find((item) => item.id === id)
  expect(column, `缺少列 ${id}`).toBeDefined()
  return column!
}

/** 取列的排序函数（SortingFnOption 可能为字符串预设，必须是函数才可调用） */
function sortingFnOf(id: string): SortingFn<FundTransaction> {
  const sortingFn = columnOf(id).sortingFn
  if (typeof sortingFn !== 'function') {
    throw new Error(`列 ${id} 的 sortingFn 不是函数`)
  }
  return sortingFn
}

/** 排序函数取值载体（TanStack Row 的最小结构） */
function fakeRow(value: string): Row<FundTransaction> {
  return { getValue: () => value } as unknown as Row<FundTransaction>
}

function sortValues(values: string[], direction: 'asc' | 'desc' = 'asc'): string[] {
  const sortingFn = sortingFnOf('incomeAmount')
  return [...values].sort((a, b) => {
    const result = sortingFn(fakeRow(a), fakeRow(b), 'incomeAmount')
    return direction === 'asc' ? result : -result
  })
}

describe('金额列排序使用 compareAmounts（精确比较）', () => {
  it('流入/流出金额列的 sortingFn 就是 amountSortingFn（compareAmounts 定点比较）', () => {
    expect(columnOf('incomeAmount').sortingFn).toBe(amountSortingFn)
    expect(columnOf('outcomeAmount').sortingFn).toBe(amountSortingFn)
  })

  it('负向比较场景：负数金额 < 正小数（compareAmounts 返回 -1）', () => {
    const sortingFn = sortingFnOf('incomeAmount')
    expect(sortingFn(fakeRow('-100.00'), fakeRow('0.01'), 'incomeAmount')).toBe(-1)
    expect(sortingFn(fakeRow('0.01'), fakeRow('-100.00'), 'incomeAmount')).toBe(1)
    expect(sortingFn(fakeRow('-1850.39'), fakeRow('-1850.40'), 'incomeAmount')).toBe(1)
    expect(sortingFn(fakeRow('-1850.40'), fakeRow('-1850.39'), 'incomeAmount')).toBe(-1)
    expect(sortingFn(fakeRow('-1850.39'), fakeRow('-1850.39'), 'incomeAmount')).toBe(0)
  })

  it('小数位等值不产生误差：0.10 与 0.1 比较结果为 0', () => {
    const sortingFn = sortingFnOf('incomeAmount')
    expect(sortingFn(fakeRow('0.10'), fakeRow('0.1'), 'incomeAmount')).toBe(0)
    expect(sortingFn(fakeRow('1234.50'), fakeRow('1234.5'), 'incomeAmount')).toBe(0)
  })

  it('数值序而非字典序：900.00 排在 1000.00 之前（字典序相反）', () => {
    const asc = sortValues(['1000.00', '900.00'])
    expect(asc).toEqual(['900.00', '1000.00'])
    // 字典序对照（说明为何禁止按格式化字符串排序）
    expect(['1000.00', '900.00'].sort()).toEqual(['1000.00', '900.00'])
  })

  it('混合大小/负数/小数位的完整升序与降序', () => {
    const values = ['12345.66', '8200.50', '900.00', '1000.00', '-100.00', '0.01']
    expect(sortValues(values, 'asc')).toEqual([
      '-100.00',
      '0.01',
      '900.00',
      '1000.00',
      '8200.50',
      '12345.66',
    ])
    expect(sortValues(values, 'desc')).toEqual([
      '12345.66',
      '8200.50',
      '1000.00',
      '900.00',
      '0.01',
      '-100.00',
    ])
  })
})

describe('金额列排序取值（IN 进收入列 / OUT 进支出列）', () => {
  const byId = (id: string): FundTransaction => {
    const txn = DEMO_FUND_TRANSACTIONS.find((item) => item.id === id)
    expect(txn, `缺少演示流水 ${id}`).toBeDefined()
    return txn!
  }

  it('IN 流水收入列取金额、支出列取 0；OUT 流水反之', () => {
    const inflowTxn = byId('txn-001')
    expect(incomeSortValue(inflowTxn)).toBe('50000.00')
    expect(outcomeSortValue(inflowTxn)).toBe('0')

    const outflowTxn = byId('txn-002')
    expect(incomeSortValue(outflowTxn)).toBe('0')
    expect(outcomeSortValue(outflowTxn)).toBe('45000.00')
  })

  it('金额列右对齐（meta.align = right）', () => {
    expect(columnOf('incomeAmount').meta).toEqual({ align: 'right' })
    expect(columnOf('outcomeAmount').meta).toEqual({ align: 'right' })
  })

  it('列定义覆盖任务要求的 10 列', () => {
    expect(columns.map((item) => item.id)).toEqual([
      'transactionNo',
      'transactionType',
      'tradeDate',
      'account',
      'counterparty',
      'incomeAmount',
      'outcomeAmount',
      'sourceDoc',
      'status',
      'actions',
    ])
  })
})
