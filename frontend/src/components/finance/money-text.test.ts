import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MoneyText from '@/components/finance/MoneyText.vue'

describe('MoneyText 金额展示', () => {
  const cases: [string, string][] = [
    ['0.00', '0.00'],
    ['0', '0.00'],
    ['1850.39', '1,850.39'],
    ['-1850.39', '-1,850.39'],
    ['1000000.00', '1,000,000.00'],
    ['1000000', '1,000,000.00'],
  ]

  it.each(cases)('格式化 %s → %s', (input, expected) => {
    const wrapper = mount(MoneyText, { props: { value: input } })
    expect(wrapper.text()).toBe(expected)
  })

  it('非法金额显示占位符', () => {
    const wrapper = mount(MoneyText, { props: { value: 'not-a-number' } })
    expect(wrapper.text()).toBe('—')
  })
})
