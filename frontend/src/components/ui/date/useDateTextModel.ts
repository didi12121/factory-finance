/**
 * useDateTextModel —— 业务日期文本输入的共享状态机（AmountInput 同构契约）。
 *
 * 三个状态的独立语义（与 AmountInput 一致）：
 * - `touched`：用户已失焦或已触发过校验（validate()）——只决定内部错误的展示时机；
 * - `valid`（update:valid）：当前整体可提交 = 文本合法（或空且非必填）且未越出 min/max，
 *   且不存在外部表单错误（externalInvalid）；必填空值 valid 恒为 false；
 * - `showError`：仅决定内部错误文案是否渲染（外部表单错误存在时交由表单错误展示，避免重复）。
 *
 * modelValue 合约：合法 → 发出规范文本；中间态/非法/空 → 一律发出 ''，
 * **禁止表单提交旧日期**（合法改非法后旧值立即清空）；父组件回显/外部重置经 watch 同步。
 *
 * 仅做展示层校验；Store/Domain 仍是业务校验最终防线。
 */

import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

import {
  dateTextState,
  describeEmptyText,
  describeInvalidText,
  describePartialText,
  describeRangeLimitText,
  isValidText,
  type DateTextKind,
  type DateTextState,
} from './dateText'

export interface DateTextModelOptions {
  kind: DateTextKind
  modelValue: Ref<string>
  required: Ref<boolean>
  min: Ref<string | undefined>
  max: Ref<string | undefined>
  /** 外部表单错误存在（占位提示与样式由外部接管，内部错误不再重复展示） */
  externalInvalid: Ref<boolean>
  /** 合法值变更通知（规范文本或 ''） */
  onChange: (value: string) => void
}

export interface DateTextModel {
  localText: Ref<string>
  touched: Ref<boolean>
  state: ComputedRef<DateTextState>
  valid: ComputedRef<boolean>
  errorText: ComputedRef<string>
  showError: ComputedRef<boolean>
  invalid: ComputedRef<boolean>
  /** 用户输入（保留本地草稿；合法才外发，其余清空外发值） */
  onInput: (text: string) => void
  onBlur: () => void
  /** 程序化设置（日历/月份选择器选中）：同步文本并外发 */
  setText: (text: string) => void
  /** 提交前校验：触发展示并返回整体合法性 */
  validate: () => boolean
  /** 外部表单重置：清除本地草稿与 touched */
  reset: () => void
}

export function useDateTextModel(options: DateTextModelOptions): DateTextModel {
  const localText = ref(options.modelValue.value)
  const touched = ref(false)
  let lastEmitted = options.modelValue.value

  const state = computed<DateTextState>(() => dateTextState(options.kind, localText.value))

  const rangeIssue = computed(() => {
    if (state.value !== 'valid') {
      return ''
    }
    return describeRangeLimitText(options.kind, localText.value.trim(), options.min.value, options.max.value)
  })

  const valid = computed(() => {
    if (options.externalInvalid.value) {
      return false
    }
    if (state.value === 'valid') {
      return rangeIssue.value === ''
    }
    return state.value === 'empty' && !options.required.value
  })

  const internalError = computed(() => {
    if (rangeIssue.value !== '') {
      return rangeIssue.value
    }
    switch (state.value) {
      case 'invalid':
        return describeInvalidText(options.kind, localText.value)
      case 'partial':
        return touched.value ? describePartialText(options.kind) : ''
      case 'empty':
        return options.required.value && touched.value ? describeEmptyText(options.kind) : ''
      default:
        return ''
    }
  })

  // 外部表单错误展示时不再重复展示内部错误（样式仍标记 invalid）
  const showError = computed(() => !options.externalInvalid.value && internalError.value !== '')
  const invalid = computed(() => options.externalInvalid.value || showError.value)

  function emitModelValue(value: string): void {
    lastEmitted = value
    options.onChange(value)
  }

  function onInput(text: string): void {
    localText.value = text
    const trimmed = text.trim()
    if (state.value === 'valid' && rangeIssue.value === '') {
      emitModelValue(trimmed)
      return
    }
    // 空值 / 中间态 / 非法 / 越界：外发值一律清空，禁止提交旧日期
    emitModelValue('')
  }

  function onBlur(): void {
    touched.value = true
    const trimmed = localText.value.trim()
    if (isValidText(options.kind, trimmed) && describeRangeLimitText(options.kind, trimmed, options.min.value, options.max.value) === '') {
      localText.value = trimmed
      emitModelValue(trimmed)
      return
    }
    emitModelValue('')
  }

  /** 程序化设置（选择器选中）：文本即合法值 */
  function setText(text: string): void {
    localText.value = text
    lastEmitted = text
    touched.value = true
    options.onChange(text)
  }

  function validate(): boolean {
    touched.value = true
    return valid.value
  }

  function reset(): void {
    localText.value = options.modelValue.value
    lastEmitted = options.modelValue.value
    touched.value = false
  }

  // 外部表单重置/外部赋值：同步输入框并重置 touched；父组件回显不覆盖用户输入
  watch(
    () => options.modelValue.value,
    (value) => {
      if (value === lastEmitted) {
        return
      }
      localText.value = value
      lastEmitted = value
      touched.value = false
    },
  )

  return {
    localText,
    touched,
    state,
    valid,
    errorText: internalError,
    showError,
    invalid,
    onInput,
    onBlur,
    setText,
    validate,
    reset,
  }
}
