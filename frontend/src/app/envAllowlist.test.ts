/**
 * 环境允许清单单测（Phase 0.3 Task B1）。
 * 断言允许清单语义（default-deny）与两种形态（纯函数 / 构建期常量）的一致性。
 */
import { describe, expect, it } from 'vitest'

import {
  DESIGN_SYSTEM_ALLOWED_MODES,
  DESIGN_SYSTEM_BUILD,
  PROTOTYPE_ALLOWED_MODES,
  PROTOTYPE_BUILD,
  isDesignSystemMode,
  isPrototypeMode,
} from './envAllowlist'
import { DESIGN_SYSTEM_ENABLED, PROTOTYPE_ENABLED } from './config'

/** 明确允许启用演示/Design System 的 mode */
const ENABLED_MODES = ['development', 'test']

/** 必须禁用的 mode：production / staging / uat / 自定义未知 / 空串 / 大小写与格式变体 */
const DISABLED_MODES = [
  'production',
  'staging',
  'uat',
  'demo-custom',
  'preprod',
  'prod',
  'qa',
  'release',
  'canary',
  'Development',
  'TEST',
  'Test',
  'test ',
  ' test',
  'development,test',
  '',
]

describe('环境允许清单（default-deny）', () => {
  it('允许清单恰为 development / test，无多余项', () => {
    expect([...PROTOTYPE_ALLOWED_MODES]).toEqual(['development', 'test'])
    expect([...DESIGN_SYSTEM_ALLOWED_MODES]).toEqual(['development', 'test'])
  })

  it.each(ENABLED_MODES)('isPrototypeMode(%j) === true（明确允许）', (mode) => {
    expect(isPrototypeMode(mode)).toBe(true)
  })

  it.each(DISABLED_MODES)('isPrototypeMode(%j) === false（默认关闭）', (mode) => {
    expect(isPrototypeMode(mode)).toBe(false)
  })

  it.each(ENABLED_MODES)('isDesignSystemMode(%j) === true（明确允许）', (mode) => {
    expect(isDesignSystemMode(mode)).toBe(true)
  })

  it.each(DISABLED_MODES)('isDesignSystemMode(%j) === false（默认关闭）', (mode) => {
    expect(isDesignSystemMode(mode)).toBe(false)
  })

  it('staging / uat / 自定义未知 mode 不再被误判为启用（旧 MODE !== production 语义已废除）', () => {
    for (const mode of ['staging', 'uat', 'demo-custom']) {
      expect(isPrototypeMode(mode)).toBe(false)
      expect(isDesignSystemMode(mode)).toBe(false)
    }
  })

  it('演示与 Design System 两开关对全 mode 空间语义一致', () => {
    for (const mode of [...ENABLED_MODES, ...DISABLED_MODES]) {
      expect(isDesignSystemMode(mode)).toBe(isPrototypeMode(mode))
    }
  })

  it('构建期常量与纯函数语义一致（双形态不漂移）', () => {
    expect(PROTOTYPE_BUILD).toBe(isPrototypeMode(import.meta.env.MODE))
    expect(DESIGN_SYSTEM_BUILD).toBe(isDesignSystemMode(import.meta.env.MODE))
  })

  it('config.ts 与允许清单共用同一语义来源', () => {
    expect(PROTOTYPE_ENABLED).toBe(isPrototypeMode(import.meta.env.MODE))
    expect(DESIGN_SYSTEM_ENABLED).toBe(isDesignSystemMode(import.meta.env.MODE))
    expect(PROTOTYPE_ENABLED).toBe(PROTOTYPE_BUILD)
    expect(DESIGN_SYSTEM_ENABLED).toBe(DESIGN_SYSTEM_BUILD)
  })

  it('Vitest（mode=test）下演示与 Design System 启用，单测环境不被隔离误伤', () => {
    expect(import.meta.env.MODE).toBe('test')
    expect(PROTOTYPE_BUILD).toBe(true)
    expect(DESIGN_SYSTEM_BUILD).toBe(true)
    expect(PROTOTYPE_ENABLED).toBe(true)
    expect(DESIGN_SYSTEM_ENABLED).toBe(true)
  })
})
