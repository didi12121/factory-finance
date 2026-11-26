import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * 类名合并工具（shadcn/vue 风格）。
 *
 * tailwind-merge 默认配置无法识别本项目自定义 Typography / Color Token
 * （如 `text-metric` 字号与 `text-text-primary` 颜色都以 `text-` 开头），
 * 会把它们误判为同一类而错误互删。这里显式注册自定义类组，
 * 保证 `cn('text-metric', 'text-text-primary')` 两者共存。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // 自定义字号 Token（styles/tokens.css --text-*）
      'font-size': [
        {
          text: ['page-title', 'section-title', 'body', 'table', 'caption', 'metric', 'metric-lg'],
        },
      ],
      // 自定义语义颜色 Token（styles/tokens.css --color-*）
      'text-color': [
        {
          text: [
            'text-primary',
            'text-secondary',
            'text-muted',
            'brand',
            'brand-hover',
            'brand-subtle',
            'brand-foreground',
            'success',
            'success-subtle',
            'success-foreground',
            'warning',
            'warning-subtle',
            'warning-foreground',
            'danger',
            'danger-subtle',
            'danger-foreground',
            'background',
            'surface',
            'surface-hover',
            'border',
            'white',
          ],
        },
      ],
    },
  },
})

/** 合并 Tailwind 类名，正确处理项目自定义 Token */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
