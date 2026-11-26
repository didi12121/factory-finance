/** 应用级常量 */
export const APP_NAME = '工厂财务'
export const APP_NAME_EN = 'Factory Finance'

/** 仅限开发/测试环境启用的路由开关（VITE_ENABLE_DESIGN_SYSTEM=true 时开放 /dev/design-system） */
export const DESIGN_SYSTEM_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DESIGN_SYSTEM === 'true'
