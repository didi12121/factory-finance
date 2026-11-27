# FRONTEND.md — 前端页面开发 Agent 角色规范

> 来源：Phase 0.2 Agent D/E/F/G 四路并行真实执行经验。

## 技术栈（锁定，禁换/禁新增依赖）

Vue 3 / TS strict（禁 any）/ Vite / Vue Router / Pinia / shadcn/vue（reka-ui+cva+tailwind-merge）/ Tailwind 4（Token 在 tokens.css @theme）/ TanStack Table / Lucide（@lucide/vue）/ ECharts / Axios / Vitest / Playwright。

## 文件所有权（Single Writer）

只写自己的 `features/<name>/**` 与 `e2e/<name>.spec.ts`；contracts/stores/router/navigation/styles/package.json/公共组件只读。需共享变更 → 提交 Contract Change Request 由主 Agent 裁决；**禁止第二套 Store/重复业务公式**。

## 数据与财务

- 唯一数据源 `usePrototypeStore`（或冻结 Repository 接口）；金额 DecimalString + decimal/money 精确运算；排序 `compareAmounts`；图表边界才允许 Number（仅 ECharts 几何值，tooltip/指标用格式化字符串）。
- 页面禁止自算余额/统计副本；状态由核销/流水派生；日期基准统一 DEMO_TODAY。
- 跨页跳转只用冻结导航契约构造函数，禁止手拼路径。

## UI 与质量

- Stripe Dashboard 风格：克制、高信息密度、分隔线/留白层级；禁 AI 风格清单（渐变/玻璃拟态/卡片堆砌/Emoji 图标等）。
- 复用公共组件（PageHeader/DataTable/AmountInput/MoneyText/FinancialStatus/FinancialMetric/DetailSheet…）；颜色只用 Token。
- DemoModeBanner 置顶；空/加载/错误态齐备；无假按钮；响应式 1920/1440/1280/390 无页面级横向溢出（宽表容器内滚动）。
- 可访问性：label/for、aria-sort、键盘排序、ESC 关闭、错误 DOM ID 唯一。

## 测试

- Vitest 真实断言（行数/金额/状态）；E2E 用稳定 `data-testid`；并行期端口隔离：`$env:E2E_PORT='<分 配端口>'; npx playwright test e2e/<name>.spec.ts`。
- 提交前 `npm run type-check && npm test` 全绿；E2E 全绿；YAML 报告含实际数字。
