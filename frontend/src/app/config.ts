/** 应用级常量 */
export const APP_NAME = '工厂财务'
export const APP_NAME_EN = 'Factory Finance'

/** 仅限开发/测试环境启用的路由开关（VITE_ENABLE_DESIGN_SYSTEM=true 时开放 /dev/design-system） */
export const DESIGN_SYSTEM_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DESIGN_SYSTEM === 'true'

/**
 * 原型（演示业务）开关：dev 或显式启用（VITE_ENABLE_PROTOTYPE=true）。
 * 生产构建未启用时，演示页面动态导入分支被构建期消除（见 router/index.ts）。
 */
export const PROTOTYPE_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_PROTOTYPE === 'true'
