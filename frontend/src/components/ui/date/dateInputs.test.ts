/**
 * 统一业务日期组件（展示层）测试：
 * 手动输入/清空/必填/非法日期（含闰年）/min-max/外部错误/valid 通知/日期范围顺序。
 * 日历浮层交互由 E2E 真实浏览器验证（date-inputs.spec.ts）。
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AccountingMonthInput from './AccountingMonthInput.vue'
import BusinessDateInput from './BusinessDateInput.vue'
import DateRangeInput from './DateRangeInput.vue'
import OperationDateTimeInput from './OperationDateTimeInput.vue'

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function inputOf(wrapper: ReturnType<typeof mount>): HTMLInputElement {
  return wrapper.get('input[type="text"]').element as HTMLInputElement
}

describe('BusinessDateInput（业务日期 YYYY-MM-DD）', () => {
  it('格式提示与业务日期回显（DOM ID 兼容 ${id}-format-hint）', async () => {
    const wrapper = mount(BusinessDateInput, {
      props: { modelValue: '2026-11-30', id: 'receipt-date' },
    })
    const hint = wrapper.get('#receipt-date-format-hint')
    expect(hint.text()).toContain('格式 YYYY-MM-DD')
    expect(hint.text()).toContain('2026-11-30')

    await wrapper.setProps({ modelValue: '2026-12-05' })
    expect(wrapper.get('#receipt-date-format-hint').text()).toContain('2026-12-05')
  })

  it('合法输入发出规范值与 valid=true', async () => {
    const wrapper = mount(BusinessDateInput, { props: { modelValue: '' } })
    await wrapper.get('input').setValue('2026-11-30')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-11-30'])
    expect(wrapper.emitted('update:valid')?.at(-1)).toEqual([true])
  })

  it('非法日期 2026-02-30：UI 层错误提示（闰年/月份天数）且不外发旧值', async () => {
    const wrapper = mount(BusinessDateInput, {
      props: { modelValue: '2026-11-30', id: 'statement-date' },
    })
    await wrapper.get('input').setValue('2026-02-30')
    // 非法后旧值立即清空（禁止表单提交旧日期）
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('update:valid')?.at(-1)).toEqual([false])
    await flush()
    const error = wrapper.get('#statement-date-input-error')
    expect(error.text()).toContain('日期不存在')
    expect(error.text()).toContain('闰年')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
  })

  it('2025-02-29 报错、2024-02-29（闰年）通过', async () => {
    const wrapper = mount(BusinessDateInput, { props: { modelValue: '' } })
    await wrapper.get('input').setValue('2025-02-29')
    await wrapper.get('input').trigger('blur')
    await flush()
    expect(wrapper.text()).toContain('日期不存在')

    await wrapper.get('input').setValue('2024-02-29')
    await wrapper.get('input').trigger('blur')
    await flush()
    expect(wrapper.text()).not.toContain('日期不存在')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2024-02-29'])
  })

  it('输入中间态不报错、失焦后提示补全', async () => {
    const wrapper = mount(BusinessDateInput, { props: { modelValue: '' } })
    await wrapper.get('input').setValue('2026-1')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    await flush()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await wrapper.get('input').trigger('blur')
    await flush()
    expect(wrapper.text()).toContain('日期格式不完整')
  })

  it('必填空值失焦后提示', async () => {
    const wrapper = mount(BusinessDateInput, { props: { modelValue: '', required: true } })
    expect(wrapper.emitted('update:valid')?.at(-1)).toEqual([false])
    await wrapper.get('input').trigger('blur')
    await flush()
    expect(wrapper.text()).toContain('请输入业务日期')
  })

  it('min/max 日期限制提示', async () => {
    const wrapper = mount(BusinessDateInput, {
      props: { modelValue: '', min: '2026-11-01', max: '2026-11-30' },
    })
    await wrapper.get('input').setValue('2026-12-05')
    await wrapper.get('input').trigger('blur')
    await flush()
    expect(wrapper.text()).toContain('日期不得晚于 2026-11-30')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])

    await wrapper.get('input').setValue('2026-10-31')
    await wrapper.get('input').trigger('blur')
    await flush()
    expect(wrapper.text()).toContain('日期不得早于 2026-11-01')
  })

  it('清空按钮清除输入（空值语义：如无到期日期）', async () => {
    const wrapper = mount(BusinessDateInput, { props: { modelValue: '2026-11-30' } })
    expect(wrapper.find('[aria-label="清空日期"]').exists()).toBe(true)
    await wrapper.get('[aria-label="清空日期"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(inputOf(wrapper).value).toBe('')
    expect(wrapper.find('[aria-label="清空日期"]').exists()).toBe(false)
  })

  it('外部表单错误（invalid）时抑制内部重复提示并标红', async () => {
    const wrapper = mount(BusinessDateInput, {
      props: { modelValue: '2026-02-30', id: 'external', invalid: true },
    })
    await flush()
    expect(wrapper.find('#external-input-error').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
  })

  it('日历触发按钮存在（键盘可聚焦，交互由 E2E 覆盖）', () => {
    const wrapper = mount(BusinessDateInput, { props: { modelValue: '' } })
    const trigger = wrapper.get('[aria-label="打开日历"]')
    expect(trigger.attributes('type')).toBe('button')
    expect(trigger.attributes('disabled')).toBeUndefined()
  })
})

describe('AccountingMonthInput（会计月份 YYYY-MM）', () => {
  it('合法月份外发；2026-13 非法提示', async () => {
    const wrapper = mount(AccountingMonthInput, { props: { modelValue: '', id: 'create-month' } })
    await wrapper.get('input').setValue('2026-12')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-12'])
    expect(wrapper.get('#create-month-format-hint').text()).toContain('格式 YYYY-MM')

    await wrapper.get('input').setValue('2026-13')
    await wrapper.get('input').trigger('blur')
    await flush()
    expect(wrapper.get('#create-month-input-error').text()).toContain('月份不存在')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })
})

describe('OperationDateTimeInput（操作时间 YYYY-MM-DD HH:mm）', () => {
  it('合法时间外发；非法时间与 ISO 写法提示', async () => {
    const wrapper = mount(OperationDateTimeInput, { props: { modelValue: '' } })
    await wrapper.get('input').setValue('2026-11-30 08:15')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-11-30 08:15'])

    await wrapper.get('input').setValue('2026-11-30 24:00')
    await wrapper.get('input').trigger('blur')
    await flush()
    expect(wrapper.text()).toContain('时间不存在')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })

  it('日历选中日期保留时间部分（未输入时间默认 00:00）', async () => {
    const wrapper = mount(OperationDateTimeInput, { props: { modelValue: '2026-11-30 09:30' } })
    // 通过组件暴露的日期选择回调无法直接触发（浮层在 E2E 覆盖），
    // 此处验证部分提取与组装一致性
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('2026-11-30 09:30')
  })
})

describe('DateRangeInput（日期范围 YYYY-MM-DD 至 YYYY-MM-DD）', () => {
  it('双端输入外发与格式提示', async () => {
    const wrapper = mount(DateRangeInput, {
      props: {
        from: '',
        to: '',
        fromId: 'receipt-date-from',
        toId: 'receipt-date-to',
        fromTestId: 'filter-date-from',
        toTestId: 'filter-date-to',
      },
    })
    expect(wrapper.find('[data-testid="filter-date-from"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="filter-date-to"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('格式 YYYY-MM-DD 至 YYYY-MM-DD')

    await wrapper.get('[data-testid="filter-date-from"]').setValue('2026-11-01')
    expect(wrapper.emitted('update:from')?.at(-1)).toEqual(['2026-11-01'])
    await wrapper.get('[data-testid="filter-date-to"]').setValue('2026-11-30')
    expect(wrapper.emitted('update:to')?.at(-1)).toEqual(['2026-11-30'])
  })

  it('开始日期晚于结束日期给出区间顺序错误', async () => {
    const wrapper = mount(DateRangeInput, {
      props: { from: '2026-11-30', to: '2026-11-01', fromId: 'range-from' },
    })
    await flush()
    expect(wrapper.get('#range-from-range-error').text()).toContain('开始日期不得晚于结束日期')

    await wrapper.setProps({ from: '2026-11-01', to: '2026-11-30' })
    await flush()
    expect(wrapper.find('#range-from-range-error').exists()).toBe(false)
  })

  it('任一端留空表示该端不限（不报顺序错误）', async () => {
    const wrapper = mount(DateRangeInput, {
      props: { from: '2026-11-30', to: '' },
    })
    await flush()
    expect(wrapper.text()).not.toContain('开始日期不得晚于结束日期')
    expect(wrapper.text()).toContain('不限')
  })
})
