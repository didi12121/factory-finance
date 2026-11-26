import { describe, expect, it } from 'vitest'

import { useToast } from '@/components/ui/toast/useToast'

describe('useToast 行为', () => {
  it('展示与关闭通知', () => {
    const { toasts, show, dismiss, success } = useToast()

    const id = show({ title: '测试通知' })
    expect(toasts.value.some((toast) => toast.id === id)).toBe(true)

    success('保存成功', '描述文本')
    expect(toasts.value.length).toBeGreaterThanOrEqual(2)

    dismiss(id)
    expect(toasts.value.some((toast) => toast.id === id)).toBe(false)
  })
})
