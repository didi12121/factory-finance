import { describe, expect, it } from 'vitest'

import { cn } from '@/utils/cn'

describe('cn / tailwind-merge 自定义 Token 合并行为', () => {
  it('自定义字号与语义颜色共存，不互相删除', () => {
    const merged = cn('text-metric', 'text-text-primary')
    expect(merged).toContain('text-metric')
    expect(merged).toContain('text-text-primary')
  })

  it('同类 Token 正确去重（字号）', () => {
    expect(cn('text-metric', 'text-metric-lg')).toBe('text-metric-lg')
    expect(cn('text-page-title', 'text-body')).toBe('text-body')
  })

  it('同类 Token 正确去重（语义颜色）', () => {
    expect(cn('text-text-primary', 'text-text-muted')).toBe('text-text-muted')
    expect(cn('text-brand-foreground', 'text-danger-foreground')).toBe('text-danger-foreground')
  })

  it('背景色与文字颜色、字号可以共存', () => {
    const merged = cn('text-metric font-semibold', 'text-danger-foreground', 'bg-danger-subtle')
    expect(merged).toContain('text-metric')
    expect(merged).toContain('text-danger-foreground')
    expect(merged).toContain('bg-danger-subtle')
    expect(merged).toContain('font-semibold')
  })
})
