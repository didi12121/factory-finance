/**
 * 环境允许清单 —— 演示/原型隔离开关语义的**唯一来源**（Phase 0.3 Task B1）。
 *
 * 语义（允许清单 / default-deny）：
 * - 仅**明确允许**的构建模式启用演示（原型）业务与 Design System 展示页：
 *   `development`、`test`（Vitest mode=test、Playwright 开发测试 build:test --mode test 依赖此语义）；
 * - `production` / `staging` / `uat` / 任何自定义未知 mode（如 `demo-custom`）**一律禁用**。
 *   （旧实现 `MODE !== 'production'` 会把 staging/uat/自定义 mode 误判为启用演示，已废弃。）
 *
 * 双形态导出，各有职责：
 *
 * 1) 纯函数 `isPrototypeMode` / `isDesignSystemMode` —— 运行期语义唯一实现，
 *    `app/config.ts` 与 `router/index.ts` 的运行期守卫（beforeEnter）共用；
 *
 * 2) 构建期常量 `PROTOTYPE_BUILD` / `DESIGN_SYSTEM_BUILD` —— **静态可折叠形态**，
 *    供 router 动态导入三元分支做构建期死分支消除。Vite 在任何构建中都把
 *    `import.meta.env.MODE` 静态替换为字符串字面量，随后本常量初始化表达式退化为
 *    纯字面量比较链，Rollup 可将其折叠为布尔常量，并对
 *    `PROTOTYPE_BUILD ? () => import('…演示模块') : () => Promise.resolve(PlaceholderView)`
 *    的不可达分支做 tree-shaking，演示 chunk 连同 fixtures / Mock Store
 *    不进入非允许清单 mode 的产物（Phase 0.2 实证机制；Phase 0.3 由
 *    `scripts/verify-isolation.mjs` 对 production / staging / uat / demo-custom
 *    四 mode 产物全量扫描持续验证 chunk 消除仍然成立）。
 *
 * ⚠ 约束：构建期常量必须保持「字面量比较链」形态——不得改为调用纯函数
 *    `isPrototypeMode(import.meta.env.MODE)` 或 `ALLOWED_MODES.includes(...)` 等
 *    运行期调用表达式：打包器无法在构建期求值调用表达式，三元分支无法折叠，
 *    演示 chunk 将泄漏进产物。两种形态的一致性由 `envAllowlist.test.ts` 断言，
 *    产物层由 `scripts/verify-isolation.mjs` 断言（不能只看代码）。
 */

/** 允许启用演示（原型）业务的构建模式允许清单 */
export const PROTOTYPE_ALLOWED_MODES = ['development', 'test'] as const

/** 允许启用 Design System 展示页的构建模式允许清单 */
export const DESIGN_SYSTEM_ALLOWED_MODES = ['development', 'test'] as const

/**
 * 演示（原型）业务开关语义（运行期唯一实现）。
 * @param mode 构建模式（`import.meta.env.MODE` 或任意字符串）
 * @returns 仅当 mode 在允许清单内返回 true；其余（含未知/自定义/空串/大小写变体）一律 false
 */
export function isPrototypeMode(mode: string): boolean {
  return (PROTOTYPE_ALLOWED_MODES as readonly string[]).includes(mode)
}

/**
 * Design System 展示页开关语义（运行期唯一实现）。
 * @param mode 构建模式（`import.meta.env.MODE` 或任意字符串）
 * @returns 仅当 mode 在允许清单内返回 true；其余一律 false
 */
export function isDesignSystemMode(mode: string): boolean {
  return (DESIGN_SYSTEM_ALLOWED_MODES as readonly string[]).includes(mode)
}

/**
 * 演示（原型）业务构建期开关（静态可折叠形态，见文件头 ⚠ 约束）。
 * 语义必须与 `isPrototypeMode(import.meta.env.MODE)` 保持一致（单测断言）。
 */
export const PROTOTYPE_BUILD = import.meta.env.MODE === 'development' || import.meta.env.MODE === 'test'

/**
 * Design System 展示页构建期开关（静态可折叠形态，见文件头 ⚠ 约束）。
 * 语义必须与 `isDesignSystemMode(import.meta.env.MODE)` 保持一致（单测断言）。
 */
export const DESIGN_SYSTEM_BUILD = import.meta.env.MODE === 'development' || import.meta.env.MODE === 'test'
