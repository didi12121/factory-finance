import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AmountInput from '@/components/finance/AmountInput.vue'

function lastEmit(wrapper: ReturnType<typeof mount>, event: string): unknown {
  const emitted = wrapper.emitted(event)
  return emitted?.at(-1)?.[0]
}

/** 真实父组件 v-model 场景：表单持有金额状态，提交走 validate()；required/externalError 由父组件响应式驱动 */
function mountForm(options: { required?: boolean; externalError?: string; initial?: string } = {}) {
  const amount = ref(options.initial ?? '')
  const validFlag = ref<boolean | null>(null)
  const required = ref(options.required ?? false)
  const externalError = ref<string | undefined>(options.externalError)
  let childRef: { validate: () => boolean; reset: () => void } | null = null

  const Parent = defineComponent({
    setup() {
      return () =>
        h('form', { 'data-testid': 'form' }, [
          h(AmountInput, {
            id: 'amount-field',
            modelValue: amount.value,
            'onUpdate:modelValue': (value: string) => {
              amount.value = value
            },
            'onUpdate:valid': (value: boolean) => {
              validFlag.value = value
            },
            required: required.value,
            externalError: externalError.value,
            ref: (instance: unknown) => {
              childRef = instance as { validate: () => boolean; reset: () => void }
            },
          }),
        ])
    },
  })

  const wrapper = mount(Parent)
  return {
    wrapper,
    amount,
    validFlag,
    required,
    externalError,
    submit: () => (childRef as unknown as { validate: () => boolean }).validate(),
    reset: () => (childRef as unknown as { reset: () => void }).reset(),
    input: () => wrapper.get('input'),
  }
}

describe('AmountInput 业务金额校验（DECIMAL(18,2)）', () => {
  it.each([
    ['0.00', '0.00'],
    ['0.01', '0.01'],
    ['-100.00', '-100.00'],
    ['1,000.00', '1000.00'],
    ['10,000.00', '10000.00'],
    ['100,000.00', '100000.00'],
    ['9,999,999,999,999,999.99', '9999999999999999.99'],
    ['9999999999999999.99', '9999999999999999.99'],
  ])('接受合法金额 %s → %s', async (input, expected) => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    await wrapper.get('input').setValue(input)
    expect(lastEmit(wrapper, 'update:modelValue')).toBe(expected)
    expect(lastEmit(wrapper, 'update:valid')).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it.each(['1,2,3', '12,34.56', '1,,000', '1e5', '1.234', '10000000000000000.00', '10,000,000,000,000,000.00'])(
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

  it('输入中间态不展示错误，但不判定为合法金额', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    const input = wrapper.get('input')

    await input.setValue('1.')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(lastEmit(wrapper, 'update:valid')).toBe(false)

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

  it('必填空值无论是否失焦 valid 均为 false', async () => {
    const form = mountForm({ required: true, initial: '1.00' })

    await form.input().setValue('')
    expect(form.amount.value).toBe('')
    expect(form.validFlag.value).toBe(false)

    // 失焦后展示必填错误
    await form.input().trigger('blur')
    expect(form.wrapper.find('[role="alert"]').text()).toContain('请输入金额')
    expect(form.submit()).toBe(false)
  })

  it('合法金额修改为非法金额后提交：不得提交旧金额（真实父组件 v-model）', async () => {
    const form = mountForm()

    await form.input().setValue('1850.39')
    await nextTick()
    expect(form.amount.value).toBe('1850.39')

    await form.input().setValue('1e5')
    await nextTick()
    expect(form.amount.value).toBe('')
    expect(form.validFlag.value).toBe(false)

    expect(form.submit()).toBe(false)
    expect(form.amount.value).toBe('')
  })

  it('externalError 阻断提交且 valid 为 false（外部校验不可绕过）', async () => {
    const form = mountForm({ externalError: '超出预算限额' })

    await form.input().setValue('100.00')
    await nextTick()
    // 内部金额合法但外部校验不通过：金额保留、整体不可提交
    expect(form.amount.value).toBe('100.00')
    expect(form.validFlag.value).toBe(false)

    expect(form.submit()).toBe(false)
    expect(form.wrapper.find('[role="alert"]').text()).toContain('超出预算限额')
  })

  it('错误提示 DOM ID 唯一且 aria-describedby 正确关联', async () => {
    const Parent = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(AmountInput, { modelValue: '', 'onUpdate:modelValue': () => {}, 'onUpdate:valid': () => {} }),
            h(AmountInput, { modelValue: '', 'onUpdate:modelValue': () => {}, 'onUpdate:valid': () => {} }),
          ])
      },
    })
    const wrapper = mount(Parent)
    const inputs = wrapper.findAll('input')

    await inputs[0]!.setValue('1e5')
    await inputs[1]!.setValue('1,2,3')

    const describedBy0 = inputs[0]!.attributes('aria-describedby')
    const describedBy1 = inputs[1]!.attributes('aria-describedby')
    expect(describedBy0).toBeTruthy()
    expect(describedBy1).toBeTruthy()
    expect(describedBy0).not.toBe(describedBy1)
    expect(wrapper.find(`#${describedBy0}`).exists()).toBe(true)
    expect(wrapper.find(`#${describedBy1}`).exists()).toBe(true)
  })

  it('外部表单重置清空输入与错误，再次编辑与失焦行为正常', async () => {
    const form = mountForm()

    await form.input().setValue('1e5')
    await nextTick()
    expect(form.wrapper.find('[role="alert"]').exists()).toBe(true)

    // 外部表单重置（本地草稿清除）
    form.reset()
    await nextTick()
    expect((form.input().element as HTMLInputElement).value).toBe('')
    expect(form.wrapper.find('[role="alert"]').exists()).toBe(false)

    // 再次编辑并失焦
    await form.input().setValue('5.5')
    await form.input().trigger('blur')
    expect(form.amount.value).toBe('5.50')
    expect(form.wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(form.submit()).toBe(true)
  })

  it('父组件赋予新 modelValue 时同步输入框（外部赋值）', async () => {
    const form = mountForm({ initial: '1850.39' })
    await nextTick()
    expect((form.input().element as HTMLInputElement).value).toBe('1850.39')

    form.amount.value = '9.99'
    await nextTick()
    expect((form.input().element as HTMLInputElement).value).toBe('9.99')

    form.amount.value = ''
    await nextTick()
    expect((form.input().element as HTMLInputElement).value).toBe('')
  })
})

describe('AmountInput 初始化与动态状态通知契约', () => {
  it('必填初始空值 → 初始化即同步 update:valid=false（immediate，无须交互）', () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '', required: true } })
    expect(wrapper.emitted('update:valid')).toEqual([[false]])
  })

  it('非必填初始空值 → 初始化即同步 update:valid=true', () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    expect(wrapper.emitted('update:valid')).toEqual([[true]])
  })

  it('初始合法金额 → 初始化即同步 update:valid=true', () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '1850.39' } })
    expect(wrapper.emitted('update:valid')).toEqual([[true]])
  })

  it('初始非法金额（modelValue=1e5）→ 初始化即同步 update:valid=false 且立即展示错误', () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '1e5' } })
    expect(wrapper.emitted('update:valid')).toEqual([[false]])
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('动态 required（true→false→true）→ valid 同步重算', async () => {
    const form = mountForm({ required: true })
    await nextTick()
    expect(form.validFlag.value).toBe(false)

    form.required.value = false
    await nextTick()
    expect(form.validFlag.value).toBe(true)

    form.required.value = true
    await nextTick()
    expect(form.validFlag.value).toBe(false)
    expect(form.submit()).toBe(false)
  })

  it('动态 externalError（出现→清除）→ valid 与 validate() 同步重算', async () => {
    const form = mountForm({ initial: '100.00' })
    await nextTick()
    expect(form.validFlag.value).toBe(true)
    expect(form.submit()).toBe(true)

    form.externalError.value = '超出预算限额'
    await nextTick()
    expect(form.validFlag.value).toBe(false)
    expect(form.submit()).toBe(false)
    expect(form.wrapper.find('[role="alert"]').text()).toContain('超出预算限额')

    form.externalError.value = undefined
    await nextTick()
    expect(form.validFlag.value).toBe(true)
    expect(form.submit()).toBe(true)
  })

  it('valid 通知去重：同一状态不重复 emit（输入驱动）', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '' } })
    // 初始化恰好一次 true
    expect(wrapper.emitted('update:valid')).toEqual([[true]])

    // 连续合法输入：valid 保持 true，不重复通知
    await wrapper.get('input').setValue('12.34')
    await wrapper.get('input').setValue('123.45')
    expect(wrapper.emitted('update:valid')).toEqual([[true]])

    // 合法→非法：恰好一次 false
    await wrapper.get('input').setValue('1e5')
    expect(wrapper.emitted('update:valid')).toEqual([[true], [false]])

    // 非法→合法：恰好一次 true
    await wrapper.get('input').setValue('200')
    expect(wrapper.emitted('update:valid')).toEqual([[true], [false], [true]])
  })

  it('valid 通知去重：externalError 文案变化但整体状态不变时不重复 emit', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: '100.00' } })
    expect(wrapper.emitted('update:valid')).toEqual([[true]])

    await wrapper.setProps({ externalError: '错误A' })
    expect(wrapper.emitted('update:valid')).toEqual([[true], [false]])

    // 文案变化但仍然 invalid：不重复通知
    await wrapper.setProps({ externalError: '错误B' })
    expect(wrapper.emitted('update:valid')).toEqual([[true], [false]])

    // 清除外部错误：恰好一次 true
    await wrapper.setProps({ externalError: '' })
    expect(wrapper.emitted('update:valid')).toEqual([[true], [false], [true]])
    const vm = wrapper.vm as unknown as { validate: () => boolean }
    expect(vm.validate()).toBe(true)
  })
})
