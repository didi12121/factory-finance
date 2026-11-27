/**
 * 业务日期文本模型（纯函数，展示层）。
 *
 * 统一四种业务时间输入的文本语义与校验：
 * - 业务日期 `YYYY-MM-DD`；会计月份 `YYYY-MM`；操作时间 `YYYY-MM-DD HH:mm`；
 *   日期范围由两个业务日期组成（YYYY-MM-DD 至 YYYY-MM-DD）。
 * - 校验复用 prototype domain 的日期语义（dateRules：真实公历日期/闰年判定），
 *   UI 校验不可替代 Store/Domain 校验，Domain 仍是最终防线。
 * - 仅做文本格式/日历合法性判定，不参与任何财务金额计算；
 *   文案为业务中文，不向用户暴露内部代号（如演示基准常量名、ISO 术语）。
 */

import { isValidAccountingMonth, isValidLocalDate } from '@/features/prototype/domain/dateRules'

/** 输入形态 */
export type DateTextKind = 'date' | 'month' | 'dateTime'

/** 文本状态：空 / 合法 / 输入中间态 / 非法 */
export type DateTextState = 'empty' | 'valid' | 'partial' | 'invalid'

export const DATE_FORMAT_LABEL = 'YYYY-MM-DD'
export const MONTH_FORMAT_LABEL = 'YYYY-MM'
export const DATE_TIME_FORMAT_LABEL = 'YYYY-MM-DD HH:mm'

/** 各形态的格式提示（展示给用户的业务格式，不含内部术语） */
export const FORMAT_LABELS: Record<DateTextKind, string> = {
  date: DATE_FORMAT_LABEL,
  month: MONTH_FORMAT_LABEL,
  dateTime: DATE_TIME_FORMAT_LABEL,
}

const DATE_PARTIAL_RE = /^\d{0,4}(-\d{0,2}(-\d{0,2})?)?$/
const MONTH_PARTIAL_RE = /^\d{0,4}(-\d{0,2})?$/
const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/
const DATE_TIME_PARTIAL_RE = /^\d{0,4}(-\d{0,2}(-\d{0,2}( (\d{0,2})(:(\d{0,2}))?)?)?)?$/

/** 是否为完整形状的业务日期文本（YYYY-MM-DD） */
export function isDateTextShape(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
}

/** 是否为完整形状的会计月份文本（YYYY-MM） */
export function isMonthTextShape(text: string): boolean {
  return /^\d{4}-\d{2}$/.test(text)
}

/** 是否为完整形状的操作时间文本（YYYY-MM-DD HH:mm） */
export function isDateTimeTextShape(text: string): boolean {
  return DATE_TIME_RE.test(text)
}

/** 校验业务日期（真实公历日期，含闰年；2026-02-30 / 2025-02-29 非法，2024-02-29 合法） */
export function isValidDateText(text: string): boolean {
  return isValidLocalDate(text)
}

/** 校验会计月份（YYYY-MM，月份 01-12） */
export function isValidMonthText(text: string): boolean {
  return isValidAccountingMonth(text)
}

/** 校验操作时间（真实日期 + 小时 00-23 + 分钟 00-59） */
export function isValidDateTimeText(text: string): boolean {
  const match = DATE_TIME_RE.exec(text)
  if (match === null) {
    return false
  }
  const datePart = match[1] ?? ''
  const hour = Number.parseInt(match[2] ?? '', 10)
  const minute = Number.parseInt(match[3] ?? '', 10)
  return isValidLocalDate(datePart) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function isPartialText(kind: DateTextKind, text: string): boolean {
  switch (kind) {
    case 'date':
      return DATE_PARTIAL_RE.test(text)
    case 'month':
      return MONTH_PARTIAL_RE.test(text)
    case 'dateTime':
      return DATE_TIME_PARTIAL_RE.test(text)
  }
}

export function isValidText(kind: DateTextKind, text: string): boolean {
  switch (kind) {
    case 'date':
      return isValidDateText(text)
    case 'month':
      return isValidMonthText(text)
    case 'dateTime':
      return isValidDateTimeText(text)
  }
}

/** 是否为完整形状（形状完整但日历/取值非法 → 非法而非中间态） */
function isCompleteShape(kind: DateTextKind, text: string): boolean {
  switch (kind) {
    case 'date':
      return isDateTextShape(text)
    case 'month':
      return isMonthTextShape(text)
    case 'dateTime':
      return isDateTimeTextShape(text)
  }
}

/** 文本状态判定（空 / 合法 / 输入中间态 / 非法） */
export function dateTextState(kind: DateTextKind, raw: string): DateTextState {
  const text = raw.trim()
  if (text === '') {
    return 'empty'
  }
  if (isValidText(kind, text)) {
    return 'valid'
  }
  if (isCompleteShape(kind, text)) {
    // 形状完整但非法（2026-02-30、2026-13 等）：直接判定非法，给出专门错误
    return 'invalid'
  }
  return isPartialText(kind, text) ? 'partial' : 'invalid'
}

/** 完整形状但日历上不存在（如 2026-02-30、2026-13）——给出专门错误提示 */
export function isNonExistentDateText(kind: DateTextKind, raw: string): boolean {
  const text = raw.trim()
  if (kind === 'date') {
    return isDateTextShape(text) && !isValidDateText(text)
  }
  if (kind === 'month') {
    return isMonthTextShape(text) && !isValidMonthText(text)
  }
  const match = DATE_TIME_RE.exec(text)
  return match !== null && !isValidDateTimeText(text)
}

/**
 * 非法文本的错误文案（业务中文）。
 * - 日历不存在的日期（2026-02-30 等）提示检查月份天数与闰年；
 * - 其余按格式提示补全。
 */
export function describeInvalidText(kind: DateTextKind, raw: string): string {
  if (isNonExistentDateText(kind, raw)) {
    switch (kind) {
      case 'date':
        return '日期不存在：请检查月份天数与闰年（如 2026-02-30 为无效日期）'
      case 'month':
        return '月份不存在：应为 01-12（如 2026-12）'
      case 'dateTime':
        return '时间不存在：请检查日期、小时（00-23）与分钟（00-59）'
    }
  }
  switch (kind) {
    case 'date':
      return `日期格式不正确：应为 ${DATE_FORMAT_LABEL}`
    case 'month':
      return `会计月份格式不正确：应为 ${MONTH_FORMAT_LABEL}`
    case 'dateTime':
      return `操作时间格式不正确：应为 ${DATE_TIME_FORMAT_LABEL}`
  }
}

/** 输入中间态文案（失焦后提示补全） */
export function describePartialText(kind: DateTextKind): string {
  switch (kind) {
    case 'date':
      return `日期格式不完整：请补全为 ${DATE_FORMAT_LABEL}`
    case 'month':
      return `会计月份格式不完整：请补全为 ${MONTH_FORMAT_LABEL}`
    case 'dateTime':
      return `操作时间格式不完整：请补全为 ${DATE_TIME_FORMAT_LABEL}`
  }
}

/** 必填空值文案 */
export function describeEmptyText(kind: DateTextKind): string {
  switch (kind) {
    case 'date':
      return '请输入业务日期'
    case 'month':
      return '请输入会计月份'
    case 'dateTime':
      return '请输入操作时间'
  }
}

/** min/max 越界文案（min/max 为 YYYY-MM-DD 或 YYYY-MM 字符串） */
export function describeRangeLimitText(kind: DateTextKind, text: string, min?: string, max?: string): string {
  const label = kind === 'month' ? '会计月份' : kind === 'dateTime' ? '操作时间' : '日期'
  if (min !== undefined && min !== '' && text < min) {
    return `${label}不得早于 ${min}`
  }
  if (max !== undefined && max !== '' && text > max) {
    return `${label}不得晚于 ${max}`
  }
  return ''
}

/** 提取操作时间的日期部分（YYYY-MM-DD） */
export function dateTimeDatePart(text: string): string {
  return DATE_TIME_RE.exec(text.trim())?.[1] ?? ''
}

/** 提取操作时间的时间部分（HH:mm） */
export function dateTimeTimePart(text: string): string {
  const match = DATE_TIME_RE.exec(text.trim())
  return match === null ? '' : `${match[2] ?? ''}:${match[3] ?? ''}`
}

/** 组装操作时间文本（空任一部分返回 ''） */
export function composeDateTimeText(datePart: string, timePart: string): string {
  if (datePart === '' || timePart === '') {
    return ''
  }
  return `${datePart} ${timePart}`
}

/**
 * 审计时间展示格式化：ISO 日期时间（YYYY-MM-DDTHH:mm[:ss]）→ 业务展示（YYYY-MM-DD HH:mm）。
 * 仅作用于显示层，不改写存储/传输值；不向用户暴露 ISO 分隔符等开发术语。
 */
export function formatOperationDateTime(iso: string): string {
  const text = iso.trim()
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/.exec(text)
  if (match === null) {
    return text
  }
  return `${match[1] ?? ''} ${match[2] ?? ''}`
}
