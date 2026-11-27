/**
 * 图表调色板 —— 从 CSS Design Token 运行时解析 ECharts 颜色。
 *
 * 遵守 UI 红线「业务页面禁止散落十六进制颜色」：颜色一律取自 tokens.css 的
 * `--color-*` 变量，本文件不硬编码任何色值。
 */

import type { ChartPalette } from '../chartData'

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value !== '' ? value : fallback
}

/** 解析图表调色板（流入=success、流出=danger、文字/轴线/tooltip 取中性 Token） */
export function resolveChartPalette(): ChartPalette {
  return {
    inflow: readToken('--color-success', '#09825d'),
    outflow: readToken('--color-danger', '#cd3d64'),
    axisText: readToken('--color-text-muted', '#697386'),
    axisLine: readToken('--color-border', '#e3e8ee'),
    tooltipBg: readToken('--color-surface', '#ffffff'),
    tooltipBorder: readToken('--color-border', '#e3e8ee'),
    tooltipText: readToken('--color-text-primary', '#1a1f36'),
  }
}
