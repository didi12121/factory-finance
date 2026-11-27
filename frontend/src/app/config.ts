import { DESIGN_SYSTEM_BUILD, PROTOTYPE_BUILD } from './envAllowlist'

/** 应用级常量 */
export const APP_NAME = '工厂财务'
export const APP_NAME_EN = 'Factory Finance'

/**
 * 仅限允许清单环境（development / test）启用的路由开关（开放 /dev/design-system）。
 * production / staging / uat / 自定义未知 mode 一律禁用（默认关闭）。
 * 开关语义唯一来源：`app/envAllowlist.ts`（isDesignSystemMode / DESIGN_SYSTEM_BUILD）。
 */
export const DESIGN_SYSTEM_ENABLED = DESIGN_SYSTEM_BUILD

/**
 * 原型（演示业务）开关：仅允许清单环境（development / test）启用；
 * production / staging / uat / 自定义未知 mode 一律禁用（默认关闭）。
 * 生产等构建下演示页面动态导入分支被构建期消除（见 router/index.ts；
 * 开关使用必然静态替换的 import.meta.env.MODE 的字面量比较链，
 * 未定义 VITE_* 键不参与折叠；语义唯一来源：`app/envAllowlist.ts`）。
 */
export const PROTOTYPE_ENABLED = PROTOTYPE_BUILD
