# Phase 0.1.1 Final Hotfix Report

> 生成时间：2026-11-27（Asia/Shanghai）｜基线提交：`2fc4a878a4a90a357ed79b865e890218d3d95d15`
> 范围：仅小范围 Hotfix；未重新设计 UI、未重构架构、未进入 Phase 0.2。

## 修改内容

### Task 1 — 金额正则修复 ✅

- `frontend/src/utils/money.ts`：`GROUPED_INT` 由 `[1-9]{1,3}(,\d{3})+` 改为 `[1-9]\d{0,2}(,\d{3})+`（旧正则首组禁止含 0，导致 `10,000.00` 等合法金额被误拒）。
- `money.test.ts` 新增合法金额用例：`10,000.00` / `100,000.00` / `101,000.00` / `109,999.99` / `-10,000.00` / `9,999,999,999,999,999.99`；原有非法金额用例（`1,2,3`/`12,34.56`/`1,,000`/`1e5`/`1.234`/`10000000000000000.00` 等）与 DECIMAL(18,2) 范围校验全部保留。

### Task 2 — AmountInput 校验契约修复 ✅

`frontend/src/components/finance/AmountInput.vue`：

1. `valid`/`touched`/`showError` 独立语义（组件头注释完整契约）：`touched` 只决定错误展示时机；`valid` = 整体可提交；`showError` 仅决定文案渲染。
2. 必填空值 `valid` 恒 false（无论是否失焦）。
3. 输入中间态（`1.`/`1,`/`-`）不展示错误但 `valid=false`，不进入 `modelValue`。
4. `externalError` 存在时 `validate()` 返回 false 且 `update:valid=false`（外部校验不可被提交绕过）；金额值保留。
5. 错误提示 DOM ID 唯一（`useId` 生成），`aria-describedby` 仅在错误展示时关联。
6. 真实父组件 v-model 场景测试：合法 `1850.39` 改非法 `1e5` 后提交——`modelValue` 清空、`validate()` false，**不会提交旧值**。
7. 外部表单重置契约：父组件赋予新 `modelValue` 同步输入框并重置 `touched`；`modelValue` 未变化时清除本地草稿调用新增的 `reset()`；再次编辑/失焦行为均测试覆盖。

新增/重写 `amount-input.test.ts` 共 **24 个用例**（含 6 组合法金额、7 组非法金额、必填、中间态、负数、externalError、唯一 ID、外部重置、父组件 v-model 提交）。

### Task 3 — JWT 安全约束 ✅

`JwtService.java`：

1. 签发显式 `signWith(key, Jwts.SIG.HS256)`；解析端使用 **JJWT 官方算法白名单机制** `sig().add(Jwts.SIG.HS256).and()`，仅允许 HS256。
2. 不依赖未验证 Header 判断合法性：白名单与签名校验同处已验证解析流程（签名必须先通过）。
3. 必要声明强校验：`sub`/`iss`/`iat`/`exp` 缺失抛 `MissingClaimException`；`iss` 与配置签发者一致；`exp` 30 秒时钟偏移。
4. 保留 Claims 防覆盖逻辑（`sub/iss/iat/exp/nbf/jti` 过滤 + 后置设置）不变。

新增测试（`JwtServiceTest` 11 个用例）：拒绝 HS512 签名令牌、缺 `sub`/`iat`/`exp`、错误 issuer、过期、篡改、HS256 header 断言、保留声明防覆盖、短密钥拒绝。

### Task 4 — CORS Bean 装配 ✅

- 新增独立配置类 `infrastructure/web/CorsConfig.java` 定义 `CorsConfigurationSource` Bean；`SecurityConfig` 仅构造注入，消除自引用 Bean 装配风险。
- `CorsPolicyIT`（真实 Spring 上下文，4 个用例）：允许来源预检通过并回显具体 Origin（非通配符）；拒绝来源预检无 CORS 头；允许来源实际请求回显 Origin + X-Trace-Id；拒绝来源实际请求默认拒绝（403）且无 CORS 头。全局无限制 CORS 未启用。

### Task 5 — 财务架构文档一致性 ✅

`docs/DATABASE_DESIGN.md`：

- 分录约束统一为：**借方金额与贷方金额必须且只能有一方大于零，另一方等于零**。
- 内部转账模型统一描述：单条账户流水方向 IN 或 OUT；内部转账为独立业务单据；一笔内部转账对应来源账户 OUT 与目标账户 IN 两条关联流水；两条流水金额相等、事务原子提交；不产生营业收入、费用或整体资金净变化。
- 统一表述：**已确认财务业务不得通过软删除绕过撤销及冲销规则**。
- 仅修改设计文档，未创建任何业务数据库表。

## 测试结果

| 套件 | 命令 | 通过 | 失败 |
| --- | --- | --- | --- |
| 后端单元测试 | `backend/mvnw test` | 29 | 0 |
| 后端集成测试（Testcontainers + MySQL） | `backend/mvnw verify` | 12 | 0 |
| Vitest | `npm test` | 55 | 0 |
| TypeScript 类型检查 | `npm run type-check` | 通过 | 0 |
| 前端生产构建 | `npm run build` | 通过 | 0 |
| Playwright E2E | `npm run test:e2e` | 34 | 0 |
| 生产构建 Design System 路由防护 | `npm run test:e2e:prod` | 1 | 0 |

## GitHub Actions

- 最新提交 CI：https://github.com/didi12121/factory-finance/actions（4/4 Job 预期覆盖：backend / frontend / e2e / compose-config；运行状态见 Actions 页面最新 Run）
- 本报告随附提交推送后同样触发 CI。

## 截图

本次修改不影响实际视觉效果（正则/校验逻辑/后端安全与文档），按要求未重新生成 UI 截图；`artifacts/screenshots/phase-0.1.1/` 保持 11 张既有真实浏览器截图（E2E 重跑时由 Playwright 刷新生成）。

## Git

- Hotfix 提交：见提交信息 `Phase 0.1.1 final hotfix`（本报告随附）
- 工作区状态：clean；无真实密码/Secret 提交

## STOP CONDITION

```text
PHASE_0_1_1_HOTFIX = READY_FOR_REVIEW
PHASE_0_2_STARTED = NO
REAL_FINANCIAL_BUSINESS_IMPLEMENTED = NO
REAL_FINANCIAL_DATA_IMPORTED = NO
```
