# Phase 0.2 Delivery Report — Core UI Prototypes（多 Agent 并行开发）

> 生成时间：2026-11-27（Asia/Shanghai）｜架构审核基线：`1d39cafc4ef66473e1539120d48af01a57048b5f`
> 执行模式：DSH 多 Sub-Agent 并行（Wave 0–5 + Gate 1/2 + 独立 QA 两轮）

## 1. Status

**READY_FOR_REVIEW**（全部强制验收项 PASS，OPEN_P0=0，OPEN_P1=0）

## 2. Baseline

| 项 | 值 |
| --- | --- |
| 架构审核基线 | `1d39cafc4ef66473e1539120d48af01a57048b5f`（main，与远程同步） |
| 开发基线 | 同上（工作区 clean 后开工） |
| 集成分支 | `phase-0.2/integration`（主 Agent 独占，--no-ff 合并留痕） |
| 被 QA 审核代码 | `2909b86`（Wave 3 + 修复轮合并后） |
| QA 复验通过 | `0260afc`（QA 报告复验记录） |
| 最终交付提交 | 见第 12 节 Git（本报告随附提交） |

## 3. Precondition Fixes（架构师要求的两个遗留前置整改）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| JWT 算法白名单 | **PASS** | `sig().clear().add(Jwts.SIG.HS256)` 官方机制；同密钥（≥64 字节）构造 HS256/384/512：HS256 ACCEPT、HS384/512 REJECT，无白名单对照解析器证实三令牌签名均有效（拒绝原因=算法白名单）；保留声明/issuer/过期/密钥策略全保留 |
| AmountInput 初始化/动态校验 | **PASS** | `watch(valid, immediate)` 统一通知（去重）；必填空值初始 invalid、动态 required/externalError 重算、合法改非法不提交旧值、外部重置（新值同步 + `reset()`）、错误 DOM ID 唯一；24 个契约测试（含真实父组件 v-model） |

## 4. Multi-Agent Execution Summary（真实执行，未虚构）

- **实际创建 Sub-Agent**：8 个（A/B/C/D/E/F/G/H），另经 `send_message` 续用 D/F/G/H 完成修复轮与复验轮（4 次）
- **实际模型**：`transit`（DSH 继承默认路由；`list_subagent_models` 无 MiMo V2.6 Pro 可选——如实记录）
- **实际最大并发**：4（Wave 3 D‖E‖F‖G）；Wave 1（A‖B）、修复轮（D‖G‖F）为 2–3 并发
- **工作区**：`D:\env\factory-finance-worktrees\{integration,agent-a-security,agent-b-foundation,agent-c-mock-store,agent-d-dashboard,agent-e-transactions,agent-f-receivables,agent-g-allocation,agent-h-review}`（git worktree ×9，仓库外隔离）

| Agent | 任务 | 分支 | 提交 | 启动→结束 | 合并 |
| --- | --- | --- | --- | --- | --- |
| A | JWT 白名单 | agent-a-security | `f197d10` | 10:36→10:39 | `d8f4677` |
| B | AmountInput+契约 V1 | agent-b-foundation | `8958e43` | 10:36→10:51 | `2e02acd` |
| C | Mock Store 引擎 | agent-c-mock-store | `393bed0` | 11:05→11:36 | `340acb8` |
| D | 经营概览 | agent-d-dashboard | `771484b` / 修复 `ea43c70` | 11:52→12:18 / 13:0x | `e79b5b4` / `b4f8e4d` |
| E | 资金流水 | agent-e-transactions | `c55ebae` | 11:52→12:2x | `1a77bbc` |
| F | 应收账款 | agent-f-receivables | `0e0f827` / 修复 `51b35cb` | 11:52→12:2x / 13:0x | `0b2b788` / `2909b86` |
| G | 回款核销 | agent-g-allocation | `f868b0c` / 修复 `88ea716` | 11:52→12:1x / 13:0x | `2121b24` / `e5ad30f` |
| H | 独立 QA | agent-h-review | `93fe4aa` / 复验 `0260afc` | 12:3x→12:5x / 13:1x→13:3x | 已合并 |

- **真实并行**：Wave 1（A‖B 同时启动）、Wave 3（D‖E‖F‖G 同时启动）、修复轮（D‖G‖F 同时）——均单消息多 `subagent` 启动
- **合并顺序**：A→B（Gate1）→C（Gate2）→D→G→F→E→H 产物→修复轮 D/G/F→H 复验；Git 冲突 0（文件所有权不相交）
- **共享契约变更**：V1 冻结（Gate1）→ V1.1（`contracts/labels.ts` 标签单一来源，QA F-002，主 Agent 裁决并回写消费方）
- **文件所有权变更**：无越界（逐提交 git diff 核验）；主 Agent 集成修复 3 处共享文件回归（payables 路由恢复、shell/keyboard 选择器适配、历史截图保护 ×2）
- **重新分配的修复任务**：F-004/F-005→D、F-006/F-007(收款)/F-008→G、F-007(应收)→F、F-001/F-002/F-003→主 Agent
- **环境限制**：模型路由仅 transit；本机 Node 24.14.0 低于 engines（EBADENGINE 警告，测试不受影响）；Flyway 对 MySQL 8.4 输出支持声明警告（实测通过）

## 5. Implemented Pages

| 页面 | 路由 | 内容 | 状态 |
| --- | --- | --- | --- |
| 经营概览 | /workbench | 5 指标条、收付款趋势+支出分类（ECharts）、近期流水/待收、日期筛选（本月/上月/30 天/自定义）、导航 | ✅ |
| 资金流水 | /treasury/transactions | 汇总（口径显式）、6 维筛选、10 列表格（精确排序）、详情（转账关联/收款回溯） | ✅ |
| 交易详情 | DetailSheet | 全字段+关联流水切换+跨页跳转（冻结契约） | ✅ |
| 应收账款 | /business/receivables | 4 指标、5 Tab（逾期独立）、11 列、6 维筛选、分页 | ✅ |
| 创建应收单 | Dialog | 金额 AmountInput+validate()+store 校验、防重复、不增加现金 | ✅ |
| 应收单详情 | /business/receivables/:id | 摘要/回款记录（**收款单总额 vs 本单核销分列**）/核销明细/操作历史/无效 ID 状态 | ✅ |
| 收款单列表 | /business/processing-fee | 10 列、筛选、精确排序、详情 | ✅ |
| 回款登记 | 页内表单（唯一实现） | 客户/日期/账户/AmountInput/路由预填（customerId/receivableId 校验归属） | ✅ |
| 多对多核销 | 分配表 | 手动/自动（到期日优先）、实时汇总、8 项校验、未分配禁止确认、确认二次弹窗、幂等、成功面板 | ✅ |

## 6. Data Model

- **单一数据源**：`usePrototypeStore`（Pinia）+ 内存 `PrototypeRepository`（冻结接口 13 方法）；页面零数据副本、零网络、零持久化
- **契约**：`features/prototype/contracts/`（V1.1）：6 实体 + 基础类型（DecimalString/LocalDate/AccountingMonth）+ 枚举（TransactionDirection IN/OUT、ReceivableStatus 3 态、逾期独立）+ 命令/预览/查询/错误/导航
- **金额**：全程 DecimalString + BigInt 定点（add/subtract/compareAmounts）；Number 仅 ECharts 几何边界（grep 逐处定性）
- **日期**：DEMO_TODAY=2026-11-30 统一基准；加工收入按 accountingMonth、收付按实际日期、余额为当前余额
- **应收**：余额=原始−有效核销（派生）；状态派生；逾期=dueDate<DEMO_TODAY 且未清
- **余额**：期初+有效 IN−有效 OUT 可重算（VOIDED 排除）；内部转账成对流水（同 transferGroupId，整体净零）
- **确认**：原子一次性提交（失败零变化）；幂等键 FNV-1a 参数哈希（同键同参去重、异参拒绝）
- **隔离**：演示模块仅 MODE≠production 构建（dev/test）；生产构建静态折叠消除全部演示 chunk

## 7. Cross-Module Verification（同一浏览器会话，Agent H 实测 + 截图留证）

**S1 强制场景**（示例客户 A：AR-2026-0001=8,000.00、AR-2026-0002=12,000.00；收款 15,000.00 核销 8,000+7,000）：

| 检查点 | 操作前 → 操作后 | 断言 |
| --- | --- | --- |
| 收款单 | 8 → 9 条 | SK-2026-0009 / 15,000.00 / 已核销 15,000.00 / 未分配 0.00 |
| 应收 A | 未回款 | 已结清；已收 8,000.00 / 未收 0.00 |
| 应收 B | 未回款 | 部分回款；已收 7,000.00 / 未收 5,000.00 |
| A 详情 | — | 收款单总额 15,000.00 / **本单核销 8,000.00** |
| B 详情 | — | 收款单总额 15,000.00 / **本单核销 7,000.00** |
| 资金流水 | 22 → 23 条 | FT-2026-0023 IN 15,000.00（**仅 1 条**） |
| 资金余额 | 77,661.45 → 92,661.45 | +15,000.00 |
| 应收余额 | 402,567.87 → 387,567.87 | −15,000.00 |
| 加工收入 | 99,278.32 | **变化 0.00** |

**S2 创建应收 10,000.00**：应收 +10,000（→412,567.87）、期间加工收入 +10,000（→109,278.32）、资金 0 变化、收款/流水数量不变 ✅
**S3 两次回款同一应收**：累计核销 5,000.00、剩余 7,000.00、流水 +2 ✅
**S4 无效分配五类**（超额/累计超原额/非法金额/未分配/金额 0）：失败前后逐字段一致 ✅
**S5 重复确认**：仅一张收款单/一条流水/核销不重复 ✅
**S6 内部转账**：OUT+IN 成对、汇总 0 条计入（净零）、收入/支出不含转账 ✅
**S7 生产构建**：5/5 演示路由重定向、模拟操作不可用、产物扫描 0 命中 ✅

## 8. Test Results

| 套件 | 命令 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 后端单元测试 | `backend/mvnw test` | 33 | 0 | 0 |
| 后端集成（Testcontainers） | `backend/mvnw verify` | 12 | 0 | 0 |
| 前端 Vitest | `npm test` | 300（28 文件） | 0 | 0 |
| Playwright 全量 | `npx playwright test` | 94 | 0 | 0 |
| 生产构建防护 | `npm run test:e2e:prod` | 1 | 0 | 0 |
| 类型检查 | `npm run type-check` | 通过 | 0 | — |
| 生产构建 + 产物扫描 | `npm run build` + 完整递归扫描 | 0 特征命中 | 0 | — |

- GitHub Actions：`.github/workflows/ci.yml`（backend/frontend/e2e/compose-config 四 Job）；最终提交 CI 状态见第 12 节
- QA 独立复验（第二轮）：qa spec 10/10、全量 e2e 96/96、prod 1/1、完整递归扫描 598 文件 0 命中（字面+转义双形态）

## 9. UI Evidence

- **截图**（真实浏览器、最终集成版本、交互生成状态）：`artifacts/screenshots/phase-0.2/` 共 **18 张**：
  `dashboard-1920x1080/1440x900/1280x800/mobile/custom-date`、`transactions-list/detail/empty`、`receivables-list/detail/create-receivable/empty/mobile`、`receipt-list/allocation/allocation-error/allocation-success/allocation-mobile`
- **响应式**：1920×1080、1440×900、1280×800、390×844 全部验证（页面级无横向溢出，宽表容器内滚动）
- **UI 自评**（基于实际页面）：91 / 100（风格还原 23/25、一致性 18/20、层级排版 14/15、信息密度 14/15、交互质量 13/15、响应式可访问 9/10）
- 视觉回归基线**未固化**（按要求待人工审核）；QA UI 审核 11 张目检证据留档 `docs/reviews/PHASE_0_2_QA_REPORT.md`

## 10. Known Issues

| 级别 | 项 | 状态 |
| --- | --- | --- |
| P0/P1 | 无（QA 两轮确认） | — |
| P2 | F-002 标签双份维护 | **已修复**（契约 V1.1 单一来源） |
| P3 | F-004/F-005 图表图例与窄视口刻度 | **已修复**（D） |
| P3 | F-006/F-007/F-008 收款/应收表格与日期格式 | **已修复**（G/F；日期控件原生 locale 显示残留 mm/dd/yyyy，已加「格式 YYYY-MM-DD」提示与回显，彻底自定义控件建议 Phase 0.3） |
| 环境 | Node 24.14.0 < engines 声明（EBADENGINE 警告） | 测试全绿；CI 用 Node 24（≥24.15）无警告 |
| 环境 | Linux CI 字体度量差异致 390px 页面 1px 横向溢出（Run #5） | **已修复**：共享布局 `overflow-x-clip` 兜底（不创建滚动容器、不影响内部滚动/sticky），E2E 断言保持 ≤0，Run #6 全绿 |
| 环境 | Flyway 11.7.2 对 MySQL 8.4「支持未测试」警告 | 迁移/校验实测通过（Testcontainers + Compose） |
| 待确认 | 预收款/未分配收款规则、正式会计科目/凭证规则 | 按 ACCOUNTING_RULES 标注待架构师确认，未擅自实现 |

## 11. Run Instructions

```powershell
# 本地开发（原型页面在 dev/test 构建启用；生产构建自动隔离）
powershell -ExecutionPolicy Bypass -File scripts\dev-backend.ps1    # 后端 :8080（需 MySQL 8，或 docker compose up -d mysql）
powershell -ExecutionPolicy Bypass -File scripts\dev-frontend.ps1   # 前端 :5173

# 测试
powershell -ExecutionPolicy Bypass -File scripts\run-tests.ps1      # 全部（含 E2E 与生产防护）
# 或分别：backend\mvnw verify / npm test / npm run test:e2e / npm run test:e2e:prod

# Docker Compose
Copy-Item .env.example .env; docker compose up -d --build           # http://localhost:8088
```

演示数据恢复：任意演示页面刷新即恢复初始 Fixtures（内存态，不落后端）；`usePrototypeStore().resetDemoData()` 可编程重置。

## 12. Git Status

- 集成分支：`phase-0.2/integration`（合并留痕：Gate1/2、Wave3 ×4、修复轮 ×3、QA ×2、CI 修复 ×1）
- **最终验证代码提交**：`bd07e365cb2dedd39774a089ce5cf556ba267326`（main）
- **CI 状态**：**PASS** — Run #6（head `bd07e36`）4/4 Job 全绿：https://github.com/didi12121/factory-finance/actions/runs/45948450441
  （Run #5 曾 93/94：Linux CI 字体度量差异导致 390px 1px 横向溢出，经共享布局 `overflow-x-clip` 兜底修复并复验）
- 工作区状态：clean；无真实密码/Secret；.env 未提交
- 各 Agent 提交见第 4 节表格；远程 main 快进推送（无 force、无历史改写）
- 本报告随附提交仅记录上述已验证代码的 Hash 与 CI 结果

## 13. Scope Verification

```text
PHASE_0_2 = READY_FOR_REVIEW
PHASE_0_3_STARTED = NO
PHASE_1_STARTED = NO
REAL_FINANCIAL_BUSINESS_IMPLEMENTED = NO
REAL_FINANCIAL_DATABASE_CREATED = NO
REAL_FINANCIAL_DATA_IMPORTED = NO
UNAPPROVED_ARCHITECTURE_CHANGES = NO
```
