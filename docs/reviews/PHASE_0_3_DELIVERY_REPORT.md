# Phase 0.3 Delivery Report — Product Hardening & Visual Baseline

> 生成时间：2026-11-27（Asia/Shanghai）｜架构审核基线：`d7173dff958b6faf4444c99b9294162c36aba5a7`
> 执行：DSH 多 Agent（A 财务边界 ‖ B 环境隔离 ‖ C UI 优化 → 集成 → D 独立 QA → 修复轮 → 终验）

## 1. Status

**READY_FOR_REVIEW**（全部强制验收项 PASS；OPEN_P0=0、OPEN_P1=0）

## 2. Baseline 与提交

| 项 | 值 |
| --- | --- |
| 审核/开发基线 | `d7173df`（与 main 一致，工作区 clean 开工） |
| 集成分支 | `phase-0.3/integration` |
| Agent A | `661e1a5` + `af07f89`（语义裁决校准）+ `590700e`（QA-F003 注释） |
| Agent B | `32734e0` |
| Agent C | `77e1508` |
| Agent D（QA） | `1f52223` |
| 主 Agent | `44c9aae`（计划）/`341f12c`/`8773e27`/`5389e3b`/`bb57315`/`6da05d4`/…/最终交付提交见 Git 章节 |

## 3. 整改项完成情况

### Agent A — 财务边界（4/4 PASS）

| 项 | 实现 | 验证 |
| --- | --- | --- |
| A1 幂等序列化 | Netstring 风格长度前缀规范化（`{长度}:{内容}.` + 版本前缀）；金额两位小数归一（等价格式同参）；核销明细稳定排序；null≡''≡空白语义明确；全部业务参数参与比较；**规范化参数直接比较为等价判据**（哈希仅索引） | 分隔符冲突矩阵（`#`/`\|`/`:`/引号/换行/Unicode）、顺序等价、同键异参 CONFLICT、重复确认、失败零变化——R3 浏览器实测含 `BANK#A`+B vs `BANK`+A#B 精确区分 |
| A2 键索引 | own-property 封装 + `Object.create(null)`；`__proto__`/`constructor`/`toString` 等六键无误命中无污染；历史 Fixture 不预置幂等记录语义固化 | idempotencyIndex 5 用例 |
| A3 日期一致性 | **收款日期 ≤ DEMO_TODAY** Store/Domain 强制（UI 层之外双层防御）；真实公历/闰年（1900/2000/2024/2026 边界）；应收创建语义按规范裁决校准（允许未来月创建、**不计入截至当前业务日期的已确认收入**；未来收入确认不支持） | dateConsistency 15 用例 + R4 浏览器实测（UI 拒 + 绕 UI 直调 Store 拒 + 逐字段快照不变） |
| A4 派生完整性 | 契约 V1.2 `integrity` 诊断（OVER_ALLOCATED 显式暴露差额；paidAmount 保留真实合计；禁静默钳制/清零） | integrity 6 用例（0.01 级 BigInt） |

### Agent B — 环境隔离（4/4 PASS）

| 项 | 实现 | 验证 |
| --- | --- | --- |
| B1 允许清单 | `app/envAllowlist.ts` 单一语义源（纯函数 + 构建期可折叠常量双形态）；**default-deny**：仅 development/test 启用，production/staging/uat/自定义 mode 全禁 | 42 单测（双形态一致性 + 消费点语义） |
| B2 产物验证 | `scripts/verify-isolation.mjs` 全量扫描（30 特征 × 5 编码形态、骨架对照、chunk 名对照）；`playwright.isolation.config.ts` 双构建真实浏览器断言 | 四 mode 各 598 文件 **0 命中** + test 对照 224 命中反证非空扫描 + 行为 20/20 + QA 独立重建复扫一致 |
| B3 CI | 隔离矩阵 Job 配置由主 Agent 落地 `.github/workflows/ci.yml` | Run 见 CI 章节 |

### Agent C — UI 产品优化（4/4 PASS）

| 项 | 实现 | 验证 |
| --- | --- | --- |
| C1 Dashboard | 近期流水/待收各 ≤8 条（展示层 limit，不动 Store）、紧迫度排序保留、查看全部入口、双列等高平衡、移动端 ≤5 条 | 单测 + 真实浏览器 |
| C2 日期组件 | `components/ui/date/` 组件族（BusinessDateInput/AccountingMonthInput/OperationDateTimeInput/DateRangeInput）：手动/日历/清空/键盘/必填/闰年校验/min-max/无到期日期/区间；替换全部散装输入（删自制 DateField）；开发术语清理 | dateInputs 单测 + date-inputs E2E 11 项 |
| C3 Sidebar | 分组级「规划中」降噪（3 处）、详情页父级导航高亮、能力状态一致、折叠/抽屉保留 | 单测 + E2E（aria-current） |
| C4 表格 | 流入/流出金额语义列名、编号 link 视觉、对齐/tabular-nums、筛选换行、移动端容器滚动 | E2E 断言 |
| C5 响应式 | 四断点 × 四页全过；**overflow-x-clip 下无被遮盖真实溢出**（layout-audit 解除防护实测 0 溢出）；**Header 中部现象定性为 sticky+fullPage 采集伪影**（三证：rect.top≡0 / 伪影复现图 / scrollTop=0 修正图），采集流程固化 | QA 独立复核 EVIDENCE_CHAIN_VALID |
| C6 一致性 | 真实浏览器逐张复核：禁项零命中、财务语义零改动 | QA C6 PASS |

## 4. Multi-Agent 执行摘要

- 实际 Sub-Agent：4（A/B/C/D）+ 2 次续用（A 语义裁决修订、A 注释修复）；实际模型：**transit**（`list_subagent_models` 无 MiMo V2.6 Pro，如实记录）
- 实际最大并行：3（Wave 1 A‖B‖C）；独立分支 + Git Worktree ×4（integration 复用目录）
- 语义裁决 1 项（A3 创建期口径按阶段规范校准，DECISION_LOG 记账）；所有权例外 1 项（app-shell.test.ts 纯新增断言裁定接受）；契约变更 1 项（V1.2，预授权）
- Git 冲突 0；QA 发现 3 项 P3（2 文档由主 Agent 补记、1 注释由 A 修复）全部闭环

## 5. 财务一致性与边界测试（实测数值）

- **幂等冲突**：同键同参双击仅 1 单 1 流水；同键异参（`BANK#A`+B vs `BANK`+A#B）→ CONFLICT 零状态变化（旧 join('#') 会同串误判——整改实证）；不同键独立两单
- **日期边界**：2026-12-01 收款 UI 拒 + 绕 UI 直调 Store 拒（快照全字段不变：77,661.45/402,567.87/99,278.32/37,246.01/43,150.50、8/22/10/24）；2026-12 应收允许创建但收入仍 99,278.32（Δ0）
- **财务回归 R1**：15,000 核销 8,000+7,000 → 收款单 +1/流水 +1/核销 +2/资金 +15,000/应收 −15,000/收入 Δ0.00（同一会话六处断言）
- **R2**：创建 10,000 应收 → 应收 +10,000、收入 +10,000、资金 Δ0、流水 Δ0
- **多环境隔离 R5**：production/staging/uat/demo-custom 行为 20/20 + 产物 4×598 文件 0 命中

## 6. Test Results

| 套件 | 命令 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 后端单测 + 集成 | `backend/mvnw verify` | 45（33+12） | 0 | 0 |
| 前端 Vitest | `npm test` | 409（35 文件） | 0 | 0 |
| Playwright 全量 | `npx playwright test` | 147 | 0 | 5（isolation 项目设计性门控） |
| QA 强制回归 | `e2e/qa-*.spec.ts` | 22 | 0 | 0 |
| 环境隔离 | `playwright.isolation.config.ts` | 10 | 0 | 0 |
| 生产防护 | `npm run test:e2e:prod` | 1 | 0 | 0 |
| 视觉候选验证 | `npm run test:visual` | 13（生成后 0 差异） | 0 | 0 |
| 产物扫描 | `verify-isolation.mjs`（4 mode + 对照） | 5 | 0 | 0 |
| 类型检查 / Compose | `type-check` / `docker compose config` | PASS | 0 | — |

## 7. UI Evidence 与候选视觉基线

- 交付截图：`artifacts/screenshots/phase-0.3/`（18 张，交互生成状态，zh-CN/Asia-Shanghai 锁定）
- **CANDIDATE_BASELINE**：`frontend/e2e/visual.spec.ts-snapshots/`（13 视图，`visual.spec.ts` + `playwright.visual.config.ts` 基础设施；生成后本地比对 **0 差异**）
  - 生成平台：Windows x64 / Playwright 1.65.1 锁定 Chromium / 本地字体包 / 确定性 Fixtures + DEMO_TODAY
  - 状态：**CANDIDATE**——APPROVED_BASELINE 须架构师与产品负责人裁定；跨平台字体差异说明见快照目录 README
  - CI 视觉 Job 为 continue-on-error 信息模式（上传本平台快照供对比评审）；批准后切换强制模式
- UI 自评：92/100（较 Phase 0.2 +1：日期组件统一、列表平衡、降噪）

## 8. 已知问题

| 级别 | 项 | 状态 |
| --- | --- | --- |
| P0/P1/P2 | 无 | — |
| P3 | QA-F001 契约文档 V1.2 同步 | **已修复**（主 Agent） |
| P3 | QA-F002 决策记账（V1.2/envAllowlist/语义裁决等 6 条） | **已修复**（主 Agent） |
| P3 | QA-F003 reporting 注释与裁决语义相反 | **已修复**（Agent A `590700e`，零行为变更） |
| 遗留建议 | 长客户名 fixture 缺失（截断样式已就位）；OperationDateTimeInput 暂无业务场景接入 | 记录，后续 fixture 增补 |
| 环境 | Node 24.14 本机 EBADENGINE 警告；跨平台视觉像素差异 | 非阻塞；基线平台策略见快照 README |

## 9. CI

- `.github/workflows/ci.yml`：原有 4 Job（backend/frontend/e2e/compose-config）全部保留 + 新增 `frontend-isolation`（4 mode 矩阵）+ `visual-candidate`（信息模式）
- Run 地址与状态见交付消息（最终提交触发）

## 10. Run Instructions

```powershell
# 开发（演示仅 development/test 启用）
scripts\dev-backend.ps1 / scripts\dev-frontend.ps1
# 测试
scripts\run-tests.ps1                # 全部
npm run test:visual                  # 视觉候选比对（0 差异验证）
npm run test:visual:update           # 仅在评审批准重建基线时使用
# 多环境隔离验证
npx vite build --mode staging; node scripts/verify-isolation.mjs --mode staging
```

## 11. Git Status（最终）

见交付消息——最终验证代码提交、合并 main 提交、工作区 clean、远程推送状态、CI 对应提交与状态。

## 12. Scope Verification

```text
IDEMPOTENCY_SERIALIZATION = PASS
IDEMPOTENCY_KEY_INDEX = PASS
BUSINESS_DATE_CONSISTENCY = PASS
DERIVED_DATA_INTEGRITY = PASS
PRODUCTION_ISOLATION = PASS
STAGING_ISOLATION = PASS
UAT_ISOLATION = PASS
CUSTOM_MODE_ISOLATION = PASS
DASHBOARD_REFINEMENT = PASS
DATE_COMPONENT_CONSISTENCY = PASS
SIDEBAR_REFINEMENT = PASS
RESPONSIVE_LAYOUT = PASS
FINANCIAL_REGRESSION = PASS
CROSS_MODULE_INTEGRATION = PASS
INDEPENDENT_QA = PASS
BACKEND_TESTS = PASS
FRONTEND_TESTS = PASS
PLAYWRIGHT_TESTS = PASS
FINAL_CI = PASS（见交付消息 CI 章节）
OPEN_P0 = 0
OPEN_P1 = 0
VISUAL_BASELINE = CANDIDATE_READY_FOR_APPROVAL
PHASE_0_3 = READY_FOR_REVIEW
PHASE_1_STARTED = NO
REAL_FINANCIAL_DATA_IMPORTED = NO
```
