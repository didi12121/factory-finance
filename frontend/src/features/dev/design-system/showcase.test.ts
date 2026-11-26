import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DesignSystemView from '@/features/dev/design-system/DesignSystemView.vue'

describe('Design System Showcase 页面', () => {
  it('渲染全部展示区块', () => {
    const wrapper = mount(DesignSystemView)

    for (const heading of [
      'Color Tokens',
      'Typography',
      'Buttons',
      'Inputs / AmountInput',
      'Tabs',
      'DataTable',
      'Dialog / DetailSheet',
      'FinancialMetric / MoneyText',
      'FinancialStatus',
      'EmptyState / LoadingState / ErrorState',
    ]) {
      expect(wrapper.text()).toContain(heading)
    }

    // 展示页使用明确标记的虚构测试数据
    expect(wrapper.text()).toContain('虚构测试数据')
  })

  it('MoneyText 样例展示规定格式', () => {
    const wrapper = mount(DesignSystemView)
    expect(wrapper.text()).toContain('1,850.39')
    expect(wrapper.text()).toContain('-1,850.39')
    expect(wrapper.text()).toContain('1,000,000.00')
    expect(wrapper.text()).toContain('0.00')
  })
})
