# Phase 0.1.1 Delivery Report — Architecture & UI Hardening

> 生成时间：2026-11-27（Asia/Shanghai）｜整改基线：`4d1bdd5200a1a30f816f431427da0baa21536128`
> 范围：仅整改已发现的问题；未重新初始化项目、未替换技术栈、未重新设计整体 UI、未进入 Phase 0.2。

## 1. 整改项完成情况

### 1.1 金额组件整改（要求第 2 节）— 完成

| 要求 | 完成情况 | 实现 |
| --- | --- | --- |
| 严格校验千分位，禁止删逗号接受非法输入 | ✅ | `money.ts` 严格正则：分组必须每组 3 位（`1,2,3`/`12,34.56`/`1,,000` 整体拒绝），先校验格式再去除逗号 |
| DECIMAL(18,2) 范围 | ✅ | 整数位最多 16 位；`9999999999999999.99` 合法、`10000000000000000.00` 非法 |
| 中间运算与业务校验分离 | ✅ | `decimal.ts`（高精度 BigInt 定点运算）/ `money.ts`（DECIMAL(18,2) 合法性）分层，各自头注释明确契约 |
| 非法输入不得提交旧金额 | ✅ | `AmountInput` 非法输入期间 `modelValue` 一律置 `''` + `update:valid=false`，`validate()` 提交前校验 |
| 空值/必填/负数/中间态/失焦/提交契约 | ✅ | `AmountInput.vue` 头注释完整契约；空值允许（必填可选）、负数允许、输入中间态（`1.`/`1,`）失焦前不报错、失焦归一化两位小数、提交走 `validate()` |
| `compareAmounts(a, b)` 精确比较 | ✅ | `decimal.ts`：BigInt 定点对齐比较，返回 -1/0/1 |
| 禁止 Number/parseFloat/浮点 | ✅ | 比较与运算全部 BigInt 定点；`0.1+0.2=0.3` 边界测试固定 |

**必须覆盖的测试**（`money.test.ts` / `amount-input.test.ts` / `decimal.test.ts`，全部通过）：
`0.00` ✓、`0.01` ✓、`-100.00` ✓、`1,000.00` ✓、`1,2,3` ✗拒绝、`12,34.56` ✗、`1,,000` ✗、`1e5` ✗、`1.234` ✗、`9999999999999999.99` ✓、`10000000000000000.00` ✗、合法改非法后提交（`validate()` 返回 false 且 modelValue 为空）✓。

### 1.2 DataTable 整改（要求第 3 节）— 完成

- 对齐：`TableHead`/`TableCell` 左对齐显式 `text-left`（修复浏览器默认 `th` 居中）；金额列 `meta.align='right'` + MoneyText（tabular-nums）。
- 精确排序：金额列 `sortingFn: amountSortingFn`（基于 `compareAmounts`），`components/shared/tableSorting.ts`。
- 键盘排序 + `aria-sort`：表头 `tabindex=0`、Enter/Space 触发、输出 `ascending/descending/none`、排序图标（ArrowUp/ArrowDown）。
- 页码钳制：`watch([totalCount, activePageSize])`，筛选/删除/刷新导致当前页越界时自动回退最后一页（e2e 实测：第 2 页筛选 1 条后回到第 1/1 页）。
- 服务端契约：`manualPagination`/`manualSorting` + `update:page/update:pageSize/update:sorting`，`DataTable.vue` 头注释明确。
- 分页布局：桌面端单行（`max-lg:flex-wrap`），页大小选择器固定 112px（修复 Select class 未转发问题）。
- 状态列使用 `FinancialStatus`（文字+语义色）。
- Showcase 搜索/重置实际过滤数据（docNo/客户匹配）；行内「详情/删除」操作与弹窗数据同源（`selectedRow`）。
- 未引入新的 UI 组件库（仅原有 reka-ui/tailwind-merge/cva）。

### 1.3 测试真实性整改（要求第 4 节）— 完成

- 原「DataTable 空数据状态」假断言（仅验证输入框内容）已删除，替换为真实断言：数据行数（空态 colspan 行判定）、空数据提示可见、总记录数 `共 0 条`、重置后恢复 23 条。
- 新增真实断言：筛选后行数与总数（1 条/共 1 条）、金额正负数与不同小数位排序结果（升序首行 `-100.00`、降序首行 `3,612.50`，含 `1234.5` 与 `1234.50` 等值）、非第一页筛选后页码自动重置。
- 复核其余测试：名称与断言目标一致（toast/app-shell/money-text/showcase/keyboard/shell/mobile 逐项核对，无名实不符）。

### 1.4 UI Design System 整改（要求第 5 节）— 完成

- **FinancialMetric 字号**：根因为 tailwind-merge 无法区分自定义 `text-metric`（字号）与 `text-text-primary`（颜色）互相删除；`utils/cn.ts` 使用 `extendTailwindMerge` 注册自定义类组并以 `cn.test.ts` 固定行为（4 个用例）。
- **computed style 断言**（Playwright 实测）：核心金额 28px（`text-metric`）与 32px（`text-metric-lg`）——`design-system.spec.ts` 用例「财务核心数字 computed font-size 为 28px / 32px」通过。
- 金额列右对齐 + 等宽数字（computed style 断言：`text-align: right`、`font-variant-numeric: tabular-nums`）。
- Select 属性转发修复：`inheritAttrs: false` + `v-bind="$attrs"` 到 `SelectTrigger`，class/id/aria-* 正确落到交互元素（分页选择器 112px 生效）。
- 对比度：新增语义 foreground Token，普通文本全部 ≥ 4.5:1（详见第 5 节）。
- 导航噪音：「未实现」标记由每项重复改为分组级单次提示。
- `DESIGN_SYSTEM.md` 与代码同步（Token/对比度表/组件契约/DataTable 能力）。

### 1.5 部署与工程可移植性（要求第 6 节）— 完成

- 后端容器内部端口固定 8080；宿主机映射 `BACKEND_PORT`（`.env.example`/`docker-compose.yml`）；Nginx 代理与健康检查统一 `backend:8080`。
- 脚本去绝对路径：`scripts/*.ps1` 基于 `JAVA_HOME`/`PATH` 探测；新增 Linux/macOS `scripts/*.sh`（dev-backend/dev-frontend/run-tests）。
- **Maven Wrapper 3.9.11**（`backend/mvnw`、`mvnw.cmd`、`.mvn/wrapper/`），README 全部改用 wrapper。
- Node 版本统一：`engines: ^22.22.2 || >=24.15.0` + `.nvmrc 24.15.0`；jsdom 固定 30.1.3（已实测 vitest 兼容）。当前 EBADENGINE 警告源于本机 Node 24.14 低于 jsdom 系声明的 24.15 下限，测试全绿；CI 使用 Node 24（≥24.15）无警告。
- Flyway/MySQL 警告实际验证：Flyway 11.7.2 在 MySQL 8.4 上迁移/校验实测通过（Testcontainers IT `FlywayMigrationIT` + Compose 实测），警告仅为 Flyway 官方支持声明（8.1）滞后于 8.4。
- `baseline-on-migrate` 默认关闭；迁移脚本保持注释-only 基线，无破坏性初始化。

### 1.6 安全基础设施整改（要求第 7 节）— 完成（未实现正式认证业务）

- `SecurityConfig`：`CorsConfigurationSource` 独立 `@Bean` + 构造注入，移除 `corsConfigurationSource(null)` 调用。
- JWT 保留声明（sub/iss/iat/exp/nbf/jti）过滤附加 claims + 保留声明后置设置，测试固定「claims 不得覆盖保留声明」。
- 算法与密钥策略明确：固定 HS256（`Jwts.SIG.HS256`，测试断言 token header `alg=HS256`）、密钥 ≥32 字节（不足启动即抛 `IllegalStateException`）。
- 非 dev/test 环境禁止占位 Secret：`SecurityStartupValidator` 启动校验（dev/test 放行，docker 等环境占位/空前缀直接失败），4 个单测覆盖。
- Trace ID 外部输入校验：限 `^[A-Za-z0-9_-]{8,64}$`，非法（过短/空格/换行/超长/中文）一律重新生成，测试覆盖 5 种非法输入。

### 1.7 财务架构文档整改（要求第 8 节）— 完成

- `DEVELOPMENT_ROADMAP.md` 已删除「无法核算的数据清零整改。」并替换为指定表述（保留原始业务事实/差异报告/人工确认/可追溯更正/禁止删除清零覆盖/未校验不得过账）。
- `DATABASE_DESIGN.md` 待确认事项新增 5 项：转账成对资金变动、分录单边为正、软删除不得绕过冲销、Phase 1/2 持久化/幂等/撤销/审计/凭证机制、模块归属与导航阶段标记一致性。
- 模块归属明确：Phase 1（treasury/masterdata/identity/expense）与 Phase 2（receivable/payable/shareholder）归属表写入路线图；导航阶段标记同步（费用管理/工资管理改为 Phase 1，与路线图「基本费用登记」一致）。
- 本阶段未实现任何财务业务数据库表。

### 1.8 GitHub Actions CI（要求第 9 节）— 完成

`.github/workflows/ci.yml`（actions/checkout@v4、setup-java@v4、setup-node@v4、upload-artifact@v4）：

| Job | 覆盖 |
| --- | --- |
| backend | JDK 21 + Maven Wrapper `mvn verify`（单测 + Testcontainers/MySQL 集成测试），上传 surefire/failsafe 报告 |
| frontend | `npm ci`、TypeScript 类型检查、Vitest、生产构建 |
| e2e | Playwright Chromium E2E + 截图 artifacts + **生产构建防护**（`/dev/design-system` 不可用） |
| compose-config | `docker compose config` 校验（`.env.example` → `.env`） |

未跳过任何失败测试；测试产物（报告 + `artifacts/screenshots/phase-0.1.1/`）作为 artifact 上传。

### 1.9 截图与视觉验证（要求第 10 节）— 完成

`artifacts/screenshots/phase-0.1.1/`（Playwright 真实浏览器、重新启动实际应用生成，11/11 齐备）：
`shell-1920x1080` `shell-1440x900` `shell-1280x800` `shell-mobile-390x844` `design-system` `data-table` `data-table-empty` `financial-metric` `financial-status` `dialog` `detail-sheet`。
未固化任何视觉回归基线。

## 2. 涉及文件（主要）

- 金额：`frontend/src/utils/{decimal,money}.ts`（+`decimal.test.ts`/`money.test.ts`）、`components/finance/AmountInput.vue`（+`amount-input.test.ts`）
- 表格：`components/shared/{DataTable,TablePagination,tableSorting}.ts?`、`components/ui/table/{TableHead,TableCell}.vue`、`components/ui/select/Select.vue`
- 展示页：`features/dev/design-system/DesignSystemView.vue`、`components/layout/SidebarNav.vue`
- Token/样式：`styles/tokens.css`（+4 个 foreground Token）、`utils/cn.ts`（+`cn.test.ts`）
- 安全：`infrastructure/security/{SecurityConfig,JwtService,SecurityStartupValidator}.java`、`common/web/TraceIdFilter.java`（+3 个测试类）
- 工程：`backend/mvnw*`、`backend/.mvn/wrapper/`、`scripts/*`（4 个）、`docker-compose.yml`、`.env.example`、`frontend/{package.json,.nvmrc,playwright.prod.config.ts}`、`.github/workflows/ci.yml`
- 文档：`docs/{DEVELOPMENT_ROADMAP,DATABASE_DESIGN,DESIGN_SYSTEM,DECISION_LOG}.md`、`README.md`
- 测试：`frontend/e2e/*`（6 个 spec）、`artifacts/screenshots/phase-0.1.1/`（11 张）

## 3. 测试命令与结果

| 套件 | 命令 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 后端单元测试 | `backend/mvnw test` | 24 | 0 | 0 |
| 后端集成测试（Testcontainers） | `backend/mvnw verify` | 8 | 0 | 0 |
| 前端 Vitest | `npm test` | 47 | 0 | 0 |
| Playwright E2E | `npm run test:e2e` | 34 | 0 | 0 |
| 生产构建防护 | `npm run test:e2e:prod` | 1 | 0 | 0 |
| 类型检查 | `npm run type-check` | 通过 | 0 | — |

## 4. GitHub Actions

- 工作流：`.github/workflows/ci.yml`（触发：push main / pull_request）
- 运行地址：https://github.com/didi12121/factory-finance/actions/runs/45857495410（Run #1，head `28a8892`）
- **状态：completed / success（4/4 Job 通过，2026-11-27 00:19 CST 实测）**：
  - `Backend（单测 + Testcontainers 集成测试）` ✅（mvn verify 含集成测试步骤）
  - `Frontend（类型检查 + Vitest + 生产构建）` ✅
  - `Playwright E2E（真实浏览器 + 截图 + 生产构建防护）` ✅（含 `/dev/design-system` 不可用验证）
  - `Docker Compose 配置校验` ✅
- 测试报告与截图 artifacts 已由 run 上传（`backend-test-reports`、`playwright-report-and-screenshots`）。

## 5. UI 差异与 Computed Style / 对比度验证

**修复前后 UI 差异**：

1. FinancialMetric 金额此前因 tailwind-merge 错误合并而未按 28px 渲染 → 修复后 metric 28px / metric-lg 32px（computed style 实测）。
2. 表格表头此前默认居中 → 现左对齐显式 `text-left`，与内容一致；金额列右对齐 + 等宽数字。
3. 状态文字（品牌/成功/警告/危险）此前用纯状态色（3.65–4.72:1）→ 现用 foreground Token（5.38–6.29:1）。
4. 分页行此前换行、选择器宽度失控 → 桌面单行、选择器 112px。
5. 导航每项「未实现」标签 → 分组级单次提示。
6. 展示页搜索/重置此前无实际作用 → 实际过滤数据；详情/删除弹窗与列表同源。

**Computed style 实测结果**（Playwright `getComputedStyle`）：

| 元素 | 属性 | 实测值 |
| --- | --- | --- |
| FinancialMetric 金额（`text-metric`） | font-size | **28px** |
| metric-lg 样例（`text-metric-lg`） | font-size | **32px** |
| 金额列单元格 | text-align | **right** |
| 金额文本（`.amount`） | font-variant-numeric | **tabular-nums** |

**状态文字对比度计算结果**（sRGB 相对亮度标准公式）：

| 组合 | 修复前 | 修复后（foreground Token） |
| --- | --- | --- |
| 品牌文字 / brand-subtle #eeebff | 4.02:1 ✗ | `brand-foreground` #4f46e5 → 5.38:1 ✓ |
| 成功文字 / success-subtle #e8f5ee | 4.29:1 ✗ | `success-foreground` #076b4d → 5.82:1 ✓ |
| 警告文字 / warning-subtle #fff4d6 | 3.65:1 ✗ | `warning-foreground` #8a5400 → 5.72:1 ✓ |
| 异常文字 / danger-subtle #fce8ef | 4.03:1 ✗ | `danger-foreground` #b02a4d → 5.46:1 ✓ |
| 警告文字 / surface | 4.00:1 ✗ | 6.27:1 ✓ |
| 正文 text-primary / surface | 16.24:1 ✓ | 不变 |
| text-secondary / surface | 7.80:1 ✓ | 不变 |
| text-muted / surface | 4.78:1 ✓ | 不变 |
| 白字 / brand（按钮） | 4.70:1 ✓ | 不变 |

普通文本全部 ≥ 4.5:1（WCAG AA）；品牌主色 #635bff 保留不变。

## 6. 已知问题及阻塞

1. 本机 Node 24.14.0 低于 jsdom 系声明的 engine 下限（^22.22.2 || ^24.15.0 || >=26），npm 输出 EBADENGINE 警告；测试全部通过，CI 与 `.nvmrc`（24.15.0）已统一版本要求。无阻塞。
2. Flyway 11.7.2 对 MySQL 8.4 输出"支持未测试（最新 8.1）"警告；迁移/校验在 Testcontainers 与 Compose 实测通过。升级 Flyway 待架构师确认。无阻塞。
3. 视觉回归基线按要求**未固化**，待人工审核。
4. 无 BLOCKED 项。

## 7. Git

- 整改主提交：`28a88928675dc6a7a2229e130444b3622eedb5b0`（Phase 0.1.1: Architecture & UI Hardening，67 files / +2109 / -357）
- 交付报告为随后的追加提交
- 工作区状态：clean；`.env` 本地文件已忽略；无真实密码/Secret 提交

## 8. Scope Verification

```text
PHASE_0_1_1 = READY_FOR_REVIEW
PHASE_0_2_STARTED = NO
REAL_FINANCIAL_BUSINESS_IMPLEMENTED = NO
REAL_FINANCIAL_DATA_IMPORTED = NO
```

完成后停止开发，等待架构师审核；未经明确批准不得进入 Phase 0.2。
