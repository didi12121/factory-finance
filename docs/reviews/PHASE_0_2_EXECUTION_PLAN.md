# Phase 0.2 Execution Plan — Multi-Agent Parallel Development

> Owner: Development Orchestrator（主 Agent）｜创建时间：2026-11-27 10:35（Asia/Shanghai）
> 本文件记录**实际执行环境与真实调度安排**，不虚构 DSH 能力。

## 1. 实际开发环境

| 项 | 值 |
| --- | --- |
| Development Orchestrator | DSH（DeepSeek Harness）root agent `lead` |
| Sub-Agent 机制 | DSH `subagent`（独立上下文、并行启动、消息回传）/ `subagent_fork` / `send_message` / `list_agents` |
| 可选模型路由 | `list_subagent_models` 仅返回 `transit`（单一 provider/model 路由），**无 MiMo V2.6 Pro 可选项** |
| 实际使用模型 | Sub-Agent 继承 DSH 默认路由模型（transit）；如实记录，不虚构模型选择 |
| Git 隔离 | `git worktree` 独立工作目录 + 独立分支 |
| 浏览器自动化 | Playwright（真实 Chromium，含截图） |
| 测试命令 | `backend/mvnw.cmd`（Windows）、`npm test`/`npm run test:e2e`/`npm run test:e2e:prod` |
| 并发限制 | 最大 4 个 Sub-Agent 并行（主 Agent 不计入） |

## 2. Git 基线

- 架构审核基线：`1d39cafc4ef66473e1539120d48af01a57048b5f`
- 开发基线：同上（main 与 origin/main 同步、工作区 clean，已核验）
- 集成分支：`phase-0.2/integration`（主 Agent 独占合并）
- Sub-Agent 分支：`phase-0.2/agent-{a-security,b-foundation,c-mock-store,d-dashboard,e-transactions,f-receivables,g-allocation,h-review}`
- 工作区根：`D:\env\factory-finance-worktrees\{integration,agent-*}`（仓库外独立目录）
- Sub-Agent 禁止：push 远程、合并他人分支、reset --hard/clean -fd、修改 GitHub Actions/全局依赖、跨工作区写文件

## 3. 任务 DAG 与执行批次

```text
Wave 0: Orchestrator 初始化（本文件）                         [DONE]
Wave 1: Agent A (JWT) || Agent B (AmountInput + 契约)        [并行 ×2]
Gate 1: 主 Agent 审核 + 合并 + 冻结 PROTOTYPE_CONTRACT V1
Wave 2: Agent C (Mock Store/Domain)                          [单任务]
Gate 2: 主 Agent 审核 + 合并 + 注册路由/导航 + 创建页面 stub
Wave 3: Agent D || E || F || G（页面四路并行）                [并行 ×4]
Wave 4: 主 Agent 集成 + Agent H 独立 QA + 并行缺陷修复
Wave 5: 全量验证 + 截图 + 交付报告 + 提交 + CI
```

依赖：A,B → Gate1 → C → Gate2 → (D,E,F,G) → 集成 → H → 终验。

## 4. Agent 角色与文件所有权（Single Writer）

| Agent | 任务 | 独占写入 | 基线 |
| --- | --- | --- | --- |
| A | P02-A JWT 算法白名单修复 | `JwtService.java`、`JwtServiceTest.java` | 1d39caf |
| B | P02-B AmountInput 初始化 + 共享契约 | `AmountInput.vue`、`amount-input.test.ts`、`features/prototype/contracts/**` | 1d39caf |
| C | P02-C Mock Store/Domain/Fixtures | `features/prototype/{data,domain,repository,stores,tests}/**` | Gate1 集成提交 |
| D | P02-D 经营概览 | `features/dashboard/**` + 对应测试 | Gate2 集成提交 |
| E | P02-E 资金流水 | `features/treasury/**` + 对应测试 | Gate2 集成提交 |
| F | P02-F 应收账款 | `features/receivables/**` + 对应测试 | Gate2 集成提交 |
| G | P02-G 回款登记/核销 | `features/receipts/**` + 对应测试 | Gate2 集成提交 |
| H | P02-H 独立 QA | 只读生产代码 + 独立 QA 产物 | 集成完成提交 |
| 主 Agent | AGENTS/README/docs、router、navigation、styles、package.json、workflows、compose、集成与交付 | — | — |

共享契约变更（contracts 目录冻结后）必须走 Contract Change Request，主 Agent 唯一裁决并指定实现人。

## 5. 验收标准（对应协议第 33 节）

- 前置：JWT_ALGORITHM_WHITELIST、AMOUNT_INPUT_VALIDATION
- 契约：SHARED_PROTOTYPE_CONTRACT=FROZEN
- 引擎：SINGLE_SOURCE_OF_TRUTH、MOCK_FINANCIAL_ENGINE、FINANCIAL_INVARIANTS、ATOMIC_MOCK_CONFIRMATION、MOCK_IDEMPOTENCY
- 页面：DASHBOARD/TRANSACTIONS/RECEIVABLES/RECEIPT_ALLOCATION_PROTOTYPE
- 质量：CROSS_MODULE_INTEGRATION、INDEPENDENT_QA、PRODUCTION_MOCK_ISOLATION、BACKEND/FRONTEND/PLAYWRIGHT_TESTS、PRODUCTION_BUILD、FINAL_SCREENSHOTS、FINAL_CI
- 范围红线：无真实财务业务/数据库/数据导入；PHASE_0_3/PHASE_1 未启动

## 6. 已知限制（如实记录）

1. **模型选择**：DSH 未提供 MiMo V2.6 Pro 路由（`list_subagent_models` 仅 `transit`），Sub-Agent 使用继承默认模型。
2. **并行能力**：DSH Sub-Agent 支持真实并行（单消息多 `subagent` 启动、独立上下文、完成通知回传），Wave 1/3 将实际并行执行；若运行时并发受限则如实降级为串行并记录。
3. **Git Worktree**：由主 Agent 统一创建/管理；Sub-Agent 在自身 worktree 内提交，集成由主 Agent 完成。
4. **端口隔离**：并行 E2E 使用 Playwright 独立 webServer 端口（4173+）与独立输出目录，避免互相覆盖。
5. **Docker**：Testcontainers 集成测试需要本机 Docker（当前可用，Docker Desktop 29.4.3）。

## 7. 实际调度记录（随执行更新）

| 时间 | 事件 |
| --- | --- |
| 10:35 | Wave 0 完成：能力检查、基线核验（1d39caf）、worktree ×3 创建、本计划落库 |
| 10:36 | Wave 1 启动：Agent A、Agent B 并行 |
