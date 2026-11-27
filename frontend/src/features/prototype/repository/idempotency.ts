/**
 * 幂等键参数哈希（Mock Store 幂等去重的内部实现）。
 *
 * 语义：同一 idempotencyKey 重复提交——
 * - 业务参数哈希一致 → 返回原收款单（不产生重复数据）；
 * - 业务参数哈希不一致 → CONFLICT 拒绝。
 * 哈希基于规范化业务参数字符串（金额统一两位小数、核销明细按应收单 ID 排序），
 * 哈希运算使用 BigInt，禁止 Number/浮点参与财务参数处理。
 */

import type { ConfirmReceiptCommand } from '../contracts'
import { normalizeAmount } from '@/utils/money'
import { canonicalAmount2 } from '../domain/amounts'

/** 规范化收款业务参数（金额定宽两位小数、核销明细稳定排序） */
export function canonicalReceiptCommandParams(command: ConfirmReceiptCommand): string {
  const allocations = command.allocations
    .map((draft) => {
      const normalized = normalizeAmount(draft.allocationAmount)
      const amount =
        normalized === null ? draft.allocationAmount.trim() : canonicalAmount2(normalized)
      return `${draft.receivableId}:${amount}`
    })
    .sort()
    .join('|')
  const normalizedActual = normalizeAmount(command.actualAmount)
  return [
    command.customerId,
    command.receiptDate,
    command.accountId,
    normalizedActual === null ? command.actualAmount.trim() : canonicalAmount2(normalizedActual),
    command.externalRef?.trim() ?? '',
    command.remark?.trim() ?? '',
    allocations,
  ].join('#')
}

/** FNV-1a 64 位哈希（BigInt 实现），输出 16 位十六进制 */
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

/** 计算收款命令的业务参数哈希（幂等去重对比用） */
export function hashReceiptCommandParams(command: ConfirmReceiptCommand): string {
  return fnv1a64Hex(canonicalReceiptCommandParams(command))
}
