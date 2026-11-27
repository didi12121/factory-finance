/**
 * 幂等键参数规范化序列化（Mock Store 幂等去重的内部实现）。
 *
 * 语义：同一 idempotencyKey 重复提交——
 * - 业务参数（规范化后）一致 → 返回原收款单（不产生重复数据）；
 * - 业务参数不一致 → CONFLICT 拒绝。
 *
 * 规范化序列化规则（固定语义，逐条测试见 tests/idempotency.test.ts）：
 * - **结构化长度前缀编码**（Netstring 风格 `{长度}:{内容}.` 逐字段编码 + 版本前缀），
 *   任何分隔符（# | : " ' 换行 空格）与任意 Unicode 字符均无歧义，
 *   禁止 join 分隔符拼接业务参数（历史 `join('#')` 存在 externalRef/remark 拼接歧义）；
 * - **金额统一规范化两位小数**：normalizeAmount（trim + 去千分位）→ canonicalAmount2
 *   （toFixedDecimals 2 语义），等价格式（'1000' / '1000.00' / ' 1,000 '）→ 同一参数；
 *   非法金额按 trim 原文参与（写时校验会拒绝，此处仅保证序列化确定性）；
 * - **文本（externalRef/remark）**：trim 后参与比较；null ≡ '' ≡ 纯空白（统一「无值」语义）；
 *   文本内部字符（含 # | : 引号 换行 中文/Unicode）原样保留，不丢信息；
 * - **核销明细按 receivableId → allocationAmount 稳定排序**后参与比较
 *   （输入顺序不同 = 同参）；
 * - **所有影响业务记录的参数**纳入比较：customerId、receiptDate、accountId、
 *   actualAmount、externalRef、remark、allocations[receivableId, allocationAmount]；
 *   idempotencyKey 本身为索引键（trim 后使用，'key ' ≡ 'key'），不参与参数序列化。
 *
 * 等价性判据：**规范化参数串直接比较**（内存原型）。FNV-1a 哈希仅作索引优化，
 * 禁止作为唯一判据（理论哈希碰撞不得造成同键异参误判）。
 * 金额红线：金额规范化走 utils/money.ts + utils/decimal.ts（BigInt 定点），
 * 禁止 Number/parseFloat/浮点参与财务参数处理。
 */

import type { ConfirmReceiptCommand } from '../contracts'
import { normalizeAmount } from '@/utils/money'
import { canonicalAmount2 } from '../domain/amounts'

/** 规范化序列化版本前缀（语义变更时递增，禁止复用旧版本号） */
const CANONICAL_VERSION = 'rp1'

/** 幂等索引键规范化：trim 后使用（'key ' ≡ 'key'；空白键由写时校验拒绝） */
export function normalizeIdempotencyKey(key: string): string {
  return key.trim()
}

/**
 * 可空文本字段规范化：trim 后参与比较。
 * 语义固定：null ≡ '' ≡ 纯空白（统一「无值」），与任何非空文本均不等价。
 */
function canonicalText(value: string | null | undefined): string {
  return value == null ? '' : value.trim()
}

/** 金额规范化：normalizeAmount → canonicalAmount2（两位小数定宽）；非法金额按 trim 原文 */
function canonicalMoney(raw: string): string {
  const normalized = normalizeAmount(raw)
  return normalized === null ? raw.trim() : canonicalAmount2(normalized)
}

/**
 * 单字段长度前缀编码：`{字符长度}:{内容}.`（Netstring 风格）。
 * 自定界、无保留字符假设——内容可含任意 # | : " ' 换行 Unicode 而不产生歧义。
 */
function encodePart(value: string): string {
  return `${value.length}:${value}.`
}

/** 字段序列：逐字段长度前缀编码后拼接（字段间同样自定界） */
function encodeParts(values: string[]): string {
  return values.map(encodePart).join('')
}

/**
 * 规范化收款业务参数（幂等等价性判据）：
 * 版本前缀 + 标量字段（customerId、receiptDate、accountId、actualAmount、
 * externalRef、remark）+ 稳定排序后的核销明细 [receivableId, allocationAmount]。
 * 输出为确定性字符串：等价命令 → 相同字符串；任何参数差异 → 不同字符串。
 */
export function canonicalReceiptCommandParams(command: ConfirmReceiptCommand): string {
  const allocations = command.allocations
    .map((draft) => ({
      receivableId: draft.receivableId.trim(),
      amount: canonicalMoney(draft.allocationAmount),
    }))
    .sort((a, b) => {
      if (a.receivableId !== b.receivableId) {
        return a.receivableId < b.receivableId ? -1 : 1
      }
      if (a.amount !== b.amount) {
        return a.amount < b.amount ? -1 : 1
      }
      return 0
    })
  return (
    `${CANONICAL_VERSION};` +
    encodeParts([
      command.customerId.trim(),
      command.receiptDate.trim(),
      command.accountId.trim(),
      canonicalMoney(command.actualAmount),
      canonicalText(command.externalRef),
      canonicalText(command.remark),
    ]) +
    encodeParts(allocations.map((item) => encodeParts([item.receivableId, item.amount])))
  )
}

/** FNV-1a 64 位哈希（BigInt 实现），输出 16 位十六进制（仅索引优化） */
function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index))
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

/**
 * 计算收款命令的业务参数哈希。
 * **仅作幂等索引优化**（如持久化索引键）；同键判定一律以
 * `canonicalReceiptCommandParams` 规范化串直接比较为准。
 */
export function hashReceiptCommandParams(command: ConfirmReceiptCommand): string {
  return fnv1a64Hex(canonicalReceiptCommandParams(command))
}
