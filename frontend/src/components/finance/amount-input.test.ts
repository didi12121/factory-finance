import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AmountInput from '@/components/finance/AmountInput.vue'

function lastEmit(wrapper: ReturnType<typeof mount>, event: string): unknown {
  const emitted = wrapper.emitted(event)
  return emitted?.at(-1)?.[0]
}

describe('AmountInput 业务金额校验（DECIMAL(18,2)）', () => {
  it.each([
    ['0.00', '0.00'],
    ['0.01', '0.01'],
    ['-100.00', '-100.00'],
    ['1,000.00', '1000.00'],
    ['9999999999999999.99', '9999999999999999.99'],
  ])('接受合法金额 %s → %s', async (input, expected) => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    await wrapper.get('input').setValue(input)
    expect(lastEmit(wrapper, 'update:modelValue')).toBe(expected)
    expect(lastEmit(wrapper, 'update:valid')).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it.each(['1,2,3', '12,34.56', '1,,000', '1e5', '1.234', '10000000000000000.00'])(
    '拒绝非法金额 %s',
    async (input) => {
      const wrapper = mount(AmountInput, { props: { modelValue: '' } })
      await wrapper.get('input').setValue(input)
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(lastEmit(wrapper, 'update:valid')).toBe(false)
    },
  )

  it('失焦归一化为两位小数', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    const input = wrapper.get('input')
    await input.setValue('0.5')
    await input.trigger('blur')
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('0.50')
  })

  it('输入中间态（如 1.）不报错，失焦后严格校验', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    const input = wrapper.get('input')
    await input.setValue('1.')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await input.trigger('blur')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(lastEmit(wrapper, 'update:valid')).toBe(false)
  })

  it('负数允许（业务规则决定符号语义）', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    await wrapper.get('input').setValue('-100.00')
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('-100.00')
    expect(lastEmit(wrapper, 'update:valid')).toBe(true)
  })

  it('合法金额修改为非法金额后尝试提交：不得提交旧金额', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    const input = wrapper.get('input')

    await input.setValue('1850.39')
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('1850.39')

    await input.setValue('1e5')
    // 非法输入期间 modelValue 清空，杜绝旧金额 1850.39 被提交
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('')
    expect(lastEmit(wrapper, 'update:valid')).toBe(false)

    const exposed = wrapper.vm as unknown as { validate: () => boolean }
    expect(exposed.validate()).toBe(false)
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('')
  })

  it('空值与必填契约', async () => {
    const optional = mount(AmountInput, { props: { modelValue: '1.00' } })
    await optional.get('input').setValue('')
    expect(lastEmit(optional, 'update:modelValue')).toBe('')
    expect(lastEmit(optional, 'update:valid')).toBe(true)

    const required = mount(AmountInput, { props: { modelValue: '1.00', required: true } })
    const requiredInput = required.get('input')
    await requiredInput.setValue('')
    await requiredInput.trigger('blur')
    expect(required.find('[role="alert"]').text()).toContain('请输入金额')
    expect(lastEmit(required, 'update:valid')).toBe(false)

    const exposed = required.vm as unknown as { validate: () => boolean }
    expect(exposed.validate()).toBe(false)
  })
})
