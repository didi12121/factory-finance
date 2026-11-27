/**
 * 测试公共辅助（仅测试使用）。
 */

import type { BusinessError, ReceiptAllocation } from '../contracts'
import { isPrototypeBusinessError } from '../repository/prototypeErrors'

/**
 * 捕获写操作的业务错误列表。
 * 操作成功（未产生业务错误）视为测试失败。
 */
export async function captureBusinessErrors(run: () => Promise<unknown>): Promise<BusinessError[]> {
  try {
    await run()
  } catch (error) {
    if (isPrototypeBusinessError(error)) {
      return error.errors
    }
    throw error
  }
  throw new Error('期望产生业务错误，但操作成功返回')
}

/** 断言错误列表包含指定 message 片段 */
export function expectErrorContaining(errors: BusinessError[], fragment: string): void {
  const found = errors.some((item) => item.message.includes(fragment))
  if (!found) {
    throw new Error(
      `期望存在包含「${fragment}」的业务错误，实际错误：${errors.map((item) => item.message).join('；') || '（无）'}`,
    )
  }
}

/** 生成核销明细（测试断言用） */
export function allocationOf(
  receiptId: string,
  receivableId: string,
  allocationAmount: string,
  allocatedAt = '2026-11-30T12:00:00',
): ReceiptAllocation {
  return {
    id: `alloc-test-${receiptId}-${receivableId}`,
    receiptId,
    receivableId,
    allocationAmount,
    allocatedAt,
  }
}
