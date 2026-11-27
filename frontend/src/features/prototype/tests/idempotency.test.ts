/**
 * 幂等参数规范化序列化测试（Task A1）：
 * 长度前缀结构化序列化无歧义化、金额等价格式、核销稳定排序、
 * null/空串/空白语义、Unicode/分隔符/引号/换行无歧义、全参数纳入比较、
 * 哈希仅索引优化（等价性以规范化参数直接比较为准）。
 */

import { describe, expect, it } from 'vitest'
import type { ConfirmReceiptCommand, ReceiptAllocationDraft } from '../contracts'
import {
  canonicalReceiptCommandParams,
  hashReceiptCommandParams,
  normalizeIdempotencyKey,
} from '../repository/idempotency'

function makeCommand(overrides: Partial<ConfirmReceiptCommand> = {}): ConfirmReceiptCommand {
  return {
    idempotencyKey: 'key-1',
    customerId: 'cust-a',
    receiptDate: '2026-11-30',
    accountId: 'acct-bank',
    actualAmount: '100.00',
    externalRef: null,
    remark: null,
    allocations: [],
    ...overrides,
  }
}

function allocationsOf(...drafts: ReceiptAllocationDraft[]): ReceiptAllocationDraft[] {
  return drafts
}

describe('canonicalReceiptCommandParams — 结构化无歧义序列化', () => {
  it('分隔符拼接歧义消除：externalRef 含 # 与 remark 含 # 的错位组合不等价', () => {
    // join('#') 时代两者的拼接结果同为 "BANK#A#B"，必须区分
    const a = makeCommand({ externalRef: 'BANK#A', remark: 'B' })
    const b = makeCommand({ externalRef: 'BANK', remark: 'A#B' })
    expect(canonicalReceiptCommandParams(a)).not.toBe(canonicalReceiptCommandParams(b))
    expect(hashReceiptCommandParams(a)).not.toBe(hashReceiptCommandParams(b))
  })

  it('核销明细分隔符歧义消除：receivableId 含 ":" 与 "|" 的错位组合不等价', () => {
    // join('|') + `${id}:${amount}` 时代两者拼接结果相同，必须区分
    const a = makeCommand({
      actualAmount: '3.00',
      allocations: allocationsOf(
        { receivableId: 'ar-1:1.00|ar-2', allocationAmount: '2.00' },
        { receivableId: 'ar-3', allocationAmount: '1.00' },
      ),
    })
    const b = makeCommand({
      actualAmount: '3.00',
      allocations: allocationsOf(
        { receivableId: 'ar-1', allocationAmount: '1.00' },
        { receivableId: 'ar-2', allocationAmount: '2.00' },
        { receivableId: 'ar-3', allocationAmount: '1.00' },
      ),
    })
    expect(canonicalReceiptCommandParams(a)).not.toBe(canonicalReceiptCommandParams(b))
  })

  it('引号/换行/空格/中文/Unicode/emoji 原样承载且无歧义', () => {
    const tricky: Array<[Partial<ConfirmReceiptCommand>, Partial<ConfirmReceiptCommand>]> = [
      [{ externalRef: 'x"y\nz' }, { externalRef: 'x"y', remark: 'z' }],
      [{ remark: "a'b\nc" }, { remark: "a'b" }],
      [{ externalRef: 'a:b' }, { externalRef: 'a', remark: ':b' }],
      [{ remark: '备注：加工费🎉' }, { remark: '备注:加工费🎉' }],
      [{ externalRef: 'ＡＢＣ' }, { externalRef: 'ABC' }],
    ]
    for (const [left, right] of tricky) {
      const a = makeCommand(left)
      const b = makeCommand({ ...left, ...right })
      expect(canonicalReceiptCommandParams(a)).not.toBe(canonicalReceiptCommandParams(b))
    }
    // 中文/emoji 不丢信息：序列化串可承载且确定
    const unicode = makeCommand({ externalRef: '银行流水#1|甲', remark: '收款：加工费🎉\n第二行' })
    expect(canonicalReceiptCommandParams(unicode)).toBe(canonicalReceiptCommandParams(makeCommand({
      externalRef: '银行流水#1|甲',
      remark: '收款：加工费🎉\n第二行',
    })))
  })

  it('金额等价格式归一：1000 / 1000.00 / 1,000 / " 1000.0 " 同参，1000.01 异参', () => {
    const base = canonicalReceiptCommandParams(makeCommand({ actualAmount: '1000.00' }))
    expect(canonicalReceiptCommandParams(makeCommand({ actualAmount: '1000' }))).toBe(base)
    expect(canonicalReceiptCommandParams(makeCommand({ actualAmount: ' 1000.00 ' }))).toBe(base)
    expect(canonicalReceiptCommandParams(makeCommand({ actualAmount: '1,000' }))).toBe(base)
    expect(canonicalReceiptCommandParams(makeCommand({ actualAmount: '1000.0' }))).toBe(base)
    expect(canonicalReceiptCommandParams(makeCommand({ actualAmount: '1000.01' }))).not.toBe(base)

    // 核销金额同样归一
    const allocA = makeCommand({
      actualAmount: '50.00',
      allocations: allocationsOf({ receivableId: 'ar-1', allocationAmount: '50.00' }),
    })
    const allocB = makeCommand({
      actualAmount: '50',
      allocations: allocationsOf({ receivableId: 'ar-1', allocationAmount: '50' }),
    })
    expect(canonicalReceiptCommandParams(allocA)).toBe(canonicalReceiptCommandParams(allocB))
  })

  it('核销明细稳定排序：顺序不同 = 同参（含金额/ID 排序键稳定）', () => {
    const forward = makeCommand({
      actualAmount: '3.00',
      allocations: allocationsOf(
        { receivableId: 'ar-001', allocationAmount: '1.00' },
        { receivableId: 'ar-002', allocationAmount: '2.00' },
      ),
    })
    const reversed = makeCommand({
      actualAmount: '3.00',
      allocations: allocationsOf(
        { receivableId: 'ar-002', allocationAmount: '2.00' },
        { receivableId: 'ar-001', allocationAmount: '1.00' },
      ),
    })
    expect(canonicalReceiptCommandParams(forward)).toBe(canonicalReceiptCommandParams(reversed))

    // 同一 receivableId 不同金额（写时校验会拒绝重复项）仍确定性排序
    const dupA = makeCommand({
      actualAmount: '3.00',
      allocations: allocationsOf(
        { receivableId: 'ar-1', allocationAmount: '1.00' },
        { receivableId: 'ar-1', allocationAmount: '2.00' },
      ),
    })
    const dupB = makeCommand({
      actualAmount: '3.00',
      allocations: allocationsOf(
        { receivableId: 'ar-1', allocationAmount: '2.00' },
        { receivableId: 'ar-1', allocationAmount: '1.00' },
      ),
    })
    expect(canonicalReceiptCommandParams(dupA)).toBe(canonicalReceiptCommandParams(dupB))
  })

  it('null / 空字符串 / 纯空白语义固定：三者等价（统一「无值」），与任何非空文本不等价', () => {
    const nullText = canonicalReceiptCommandParams(makeCommand({ externalRef: null, remark: null }))
    const emptyText = canonicalReceiptCommandParams(makeCommand({ externalRef: '', remark: '' }))
    const blankText = canonicalReceiptCommandParams(makeCommand({ externalRef: '   ', remark: ' \t ' }))
    expect(emptyText).toBe(nullText)
    expect(blankText).toBe(nullText)

    const nonEmpty = canonicalReceiptCommandParams(makeCommand({ externalRef: 'x', remark: null }))
    expect(nonEmpty).not.toBe(nullText)

    // trim 等价：前后空白不产生业务差异（内部字符保留）
    expect(canonicalReceiptCommandParams(makeCommand({ externalRef: ' REF-1 ' })))
      .toBe(canonicalReceiptCommandParams(makeCommand({ externalRef: 'REF-1' })))
    expect(canonicalReceiptCommandParams(makeCommand({ remark: 'a b' })))
      .not.toBe(canonicalReceiptCommandParams(makeCommand({ remark: 'a  b' })))
  })

  it('全部影响业务记录的参数纳入比较：逐字段变异均产生不同参数', () => {
    const base = makeCommand({
      actualAmount: '200.00',
      externalRef: 'REF',
      remark: '备注',
      allocations: allocationsOf({ receivableId: 'ar-1', allocationAmount: '200.00' }),
    })
    const baseCanonical = canonicalReceiptCommandParams(base)
    const mutations: Array<Partial<ConfirmReceiptCommand>> = [
      { customerId: 'cust-b' },
      { receiptDate: '2026-11-29' },
      { accountId: 'acct-cash' },
      { actualAmount: '200.01' },
      { externalRef: 'REF-2' },
      { remark: '备注2' },
      { allocations: allocationsOf({ receivableId: 'ar-2', allocationAmount: '200.00' }) },
      { allocations: allocationsOf({ receivableId: 'ar-1', allocationAmount: '200.01' }) },
    ]
    for (const mutation of mutations) {
      expect(canonicalReceiptCommandParams({ ...base, ...mutation })).not.toBe(baseCanonical)
    }
    // idempotencyKey 不参与参数序列化（键本身是索引）
    expect(canonicalReceiptCommandParams({ ...base, idempotencyKey: 'key-2' })).toBe(baseCanonical)
  })

  it('哈希仅索引优化：规范化串相等 ⇒ 哈希相等；等价性判据为规范化串直接比较', () => {
    const a = makeCommand({ actualAmount: '1,000.00', allocations: allocationsOf(
      { receivableId: 'ar-1', allocationAmount: '400.00' },
      { receivableId: 'ar-2', allocationAmount: '600.00' },
    ) })
    const b = makeCommand({ actualAmount: '1000', allocations: allocationsOf(
      { receivableId: 'ar-2', allocationAmount: '600' },
      { receivableId: 'ar-1', allocationAmount: '400' },
    ) })
    expect(canonicalReceiptCommandParams(a)).toBe(canonicalReceiptCommandParams(b))
    expect(hashReceiptCommandParams(a)).toBe(hashReceiptCommandParams(b))
    expect(hashReceiptCommandParams(a)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('幂等索引键规范化：trim 后等价（\'key \' ≡ \'key\'）', () => {
    expect(normalizeIdempotencyKey(' key-1 ')).toBe('key-1')
    expect(normalizeIdempotencyKey('key-1')).toBe('key-1')
    expect(normalizeIdempotencyKey('   ')).toBe('')
  })
})
