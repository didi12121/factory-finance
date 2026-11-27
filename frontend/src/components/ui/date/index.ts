/**
 * 统一业务日期组件（components/ui/date）。
 *
 * 四种业务时间输入：
 * - BusinessDateInput：业务日期 YYYY-MM-DD；
 * - AccountingMonthInput：会计月份 YYYY-MM；
 * - OperationDateTimeInput：操作时间 YYYY-MM-DD HH:mm；
 * - DateRangeInput：日期范围 YYYY-MM-DD 至 YYYY-MM-DD。
 *
 * 共同能力：手动输入、日历选择（reka-ui DatePicker/Calendar/Popover 原语）、清空、
 * 键盘操作、必填校验、非法日期校验（含闰年）、min/max 限制、日期区间筛选；
 * 不向用户暴露内部代号（演示基准常量名、ISO 分隔符等开发术语）。
 * UI 校验不可替代 Store/Domain 校验（Domain 仍是最终防线）。
 */

export { default as AccountingMonthInput } from './AccountingMonthInput.vue'
export { default as BusinessDateInput } from './BusinessDateInput.vue'
export { default as CalendarPopover } from './CalendarPopover.vue'
export { default as DateRangeInput } from './DateRangeInput.vue'
export { default as MonthPickerPopover } from './MonthPickerPopover.vue'
export { default as OperationDateTimeInput } from './OperationDateTimeInput.vue'
export * from './dateText'
export { useDateTextModel } from './useDateTextModel'
