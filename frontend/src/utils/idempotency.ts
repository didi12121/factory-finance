/**
 * 请求幂等键生成（与后端 IdempotencyGuard 校验规则一致：8-96 位字母/数字/下划线/短横线）。
 *
 * 使用约定（红线）：
 * - 每次**独立业务操作**生成一个键（对话框打开/表单提交意图产生时），同一操作的
 *   网络超时与失败重试必须复用同一个键，不得重新生成；
 * - 幂等键与业务单据编号、业务内容无关，后端以数据库唯一约束防重复记账；
 * - 操作成功后应丢弃该键（下一次同类操作是新的业务事实）。
 */

/** 生成一次性幂等键（前缀便于排查） */
export function newIdempotencyKey(prefix = 'ff'): string {
  const cryptoObject = globalThis.crypto
  if (cryptoObject !== undefined && typeof cryptoObject.randomUUID === 'function') {
    return `${prefix}-${cryptoObject.randomUUID()}`
  }
  const random = Math.random().toString(36).slice(2, 12)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

/** 是否为合法幂等键（前端预校验；后端仍为最终防线） */
export function isIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,96}$/.test(value)
}
