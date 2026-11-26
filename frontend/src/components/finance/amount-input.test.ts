import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AmountInput from '@/components/finance/AmountInput.vue'

describe('AmountInput 金额输入校验', () => {
  it('接受合法金额并输出规范化字符串', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    const input = wrapper.get('input')

    await input.setValue('1,850.39')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('1850.39')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await input.setValue('0.5')
    await input.trigger('blur')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('0.50')
  })

  it('拒绝科学计数法与超出精度的输入', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    const input = wrapper.get('input')

    await input.setValue('1e5')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('update:valid')?.at(-1)?.[0]).toBe(false)

    await input.setValue('1.234')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('update:valid')?.at(-1)?.[0]).toBe(false)
  })

  it('空输入视为合法（必填由外部校验）', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '1.00' } })
    const input = wrapper.get('input')

    await input.setValue('')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('')
    expect(wrapper.emitted('update:valid')?.at(-1)?.[0]).toBe(true)
  })
})
