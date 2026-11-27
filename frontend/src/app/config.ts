/** 应用级常量 */
export const APP_NAME = '工厂财务'
export const APP_NAME_EN = 'Factory Finance'

/** 仅限开发/测试环境启用的路由开关（非生产构建开放 /dev/design-system） */
export const DESIGN_SYSTEM_ENABLED = import.meta.env.MODE !== 'production'

/**
 * 原型（演示业务）开关：非生产构建启用。
 * 生产构建下演示页面动态导入分支被构建期消除（见 router/index.ts，
 * 开关使用必然静态替换的 import.meta.env.MODE，未定义 VITE_* 键不参与折叠）。
 */
export const PROTOTYPE_ENABLED = import.meta.env.MODE !== 'production'
