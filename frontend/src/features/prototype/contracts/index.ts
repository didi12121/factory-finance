/**
 * Prototype Contract V1 — 共享数据契约统一汇出入口。
 *
 * 面向 Mock Store 与四个页面 Agent（加工费回款、应收、资金流水、看板）：
 * - `enums`：枚举/字面量联合类型
 * - `types`：基础类型、实体、派生统计、DEMO_TODAY
 * - `errors`：统一业务错误契约
 * - `query`：分页/排序/筛选查询契约
 * - `commands`：写命令与结果类型
 * - `repository`：Repository/Store 接口
 * - `navigation`：跨页面路由契约（冻结）
 *
 * 本目录只定义契约（类型 + 接口 + 导航构造常量），不实现业务逻辑；
 * 金额一律 DecimalString、日期一律 LocalDate/AccountingMonth。
 */

export * from './enums'
export * from './types'
export * from './errors'
export * from './query'
export * from './commands'
export * from './repository'
export * from './navigation'
export * from './labels'
