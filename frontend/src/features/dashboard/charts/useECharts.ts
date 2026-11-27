/**
 * useECharts —— ECharts 组合式封装（仅 features/dashboard 内使用）。
 *
 * 职责：挂载后 init、随 option 更新 setOption、窗口缩放 resize、卸载 dispose。
 * 容器为 `v-if` 控制的 DOM：ref 为空时释放实例，重新出现时重建（空数据 ⇄ 有数据切换）。
 *
 * 环境自适应：ECharts 需要 Canvas 2D。在无 Canvas 的环境（jsdom/测试）优雅降级——
 * 不初始化实例、不改动 DOM，避免挂载崩溃；真实浏览器（有 Canvas）正常渲染。
 * 不在此封装任何财务计算（金额几何值由 chartData 在图表边界转换）。
 */

import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption, EChartsType } from 'echarts'

function supportsCanvas(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  try {
    const probe = document.createElement('canvas')
    return typeof probe.getContext === 'function' && probe.getContext('2d') !== null
  } catch {
    return false
  }
}

export function useECharts(
  container: Ref<HTMLElement | null>,
  option: Ref<EChartsOption | null>,
): void {
  let chart: EChartsType | null = null
  const enabled = supportsCanvas()

  function dispose(): void {
    try {
      chart?.dispose()
    } catch {
      /* 忽略销毁异常（环境差异） */
    }
    chart = null
  }

  function init(el: HTMLElement): void {
    dispose()
    try {
      chart = echarts.init(el)
      if (option.value) {
        chart.setOption(option.value)
      }
    } catch {
      chart = null
    }
  }

  watch(
    container,
    (el) => {
      if (!enabled) {
        return
      }
      if (el) {
        init(el)
      } else {
        dispose()
      }
    },
    { immediate: true },
  )

  watch(
    option,
    (next) => {
      if (!enabled) {
        return
      }
      if (chart && next) {
        chart.setOption(next, { notMerge: true })
      }
    },
    { deep: true },
  )

  function onResize(): void {
    chart?.resize()
  }

  onMounted(() => {
    if (enabled) {
      window.addEventListener('resize', onResize)
    }
  })

  onBeforeUnmount(() => {
    if (enabled) {
      window.removeEventListener('resize', onResize)
    }
    dispose()
  })
}
