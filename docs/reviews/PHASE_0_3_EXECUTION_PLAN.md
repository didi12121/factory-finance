# Phase 0.3 Execution Plan — Product Hardening & Visual Baseline

> Owner: Development Orchestrator｜2026-11-27 14:50（Asia/Shanghai）
> 审核基线：`d7173dff958b6faf4444c99b9294162c36aba5a7`（与 main 一致，工作区 clean）

## 1. 环境与模型

| 项 | 值 |
| --- | --- |
| Sub-Agent 机制 | DSH `subagent`/`send_message`/`list_agents` + git worktree |
| 模型路由 | `list_subagent_models` 仅返回 `transit`——**MiMo V2.6 Pro 不可选**，Sub-Agent 继承 transit（如实记录，不冒称） |
| 并发上限 | 3（Wave 1 = A‖B‖C） |
| 端口隔离 | A=4171 / B=4172 / C=4177 / QA=4178-4179（Playwright `E2E_PORT`） |

## 2. 任务 DAG

```text
Wave 0: 初始化（本文件 + worktree ×4）                        [DONE]
Wave 1: Agent A（财务边界）‖ Agent B（环境隔离）‖ Agent C（UI 优化）
Wave 2: 主 Agent 集成（所有权/日期一致性/隔离开关唯一/幂等语义/单一数据源核查）
Wave 3: Agent D 独立 QA（5 项强制回归 + UI 审核 + 候选基线核验）
Wave 4: 并行缺陷修复（如需要）
Wave 5: 全量终验 + CANDIDATE_BASELINE + 交付报告 + 提交推送 CI + STOP
```

## 3. 文件所有权（Single Writer）

| 角色 | 独占写入 | 备注 |
| --- | --- | --- |
| 主 Agent | AGENTS/agents/docs、`frontend/src/styles/**`、`frontend/package.json`、workflows、compose/deploy、集成与交付 | 共享变更唯一裁决人 |
| Agent A | `frontend/src/features/prototype/{repository,domain,tests}/**` | contracts 仅经变更申请；预授权 V1.2：ReceivableSummary 增加完整性诊断字段 |
| Agent B | `frontend/src/app/config.ts`、`frontend/src/router/index.ts`（显式授权共享写入）、`frontend/scripts/**`、`frontend/e2e/isolation.spec.ts`、`playwright.isolation.config.ts` | 隔离开关语义唯一来源 |
| Agent C | `frontend/src/components/**`、`frontend/src/features/**`（**prototype 除外**）、`frontend/src/app/navigation.ts`、`frontend/e2e/**`（qa-*/isolation 除外） | 纯 UI/交互层，禁改财务语义 |
| Agent D | `docs/reviews/PHASE_0_3_QA_REPORT.md`、`frontend/e2e/qa-*.spec.ts` | 生产代码只读 |

## 4. 验收（对应 STOP CONDITION）

幂等序列化/键索引、业务日期一致性、派生完整性、prod/staging/uat/custom 四环境隔离、Dashboard/日期组件/侧栏/响应式整改、财务回归、跨模块集成、独立 QA、前后端/E2E 测试、最终 CI、OPEN_P0/P1=0、VISUAL_BASELINE=CANDIDATE_READY_FOR_APPROVAL。

## 5. 已知限制

1. 模型路由仅 transit（MiMo V2.6 Pro 不可选）。
2. 视觉基线仅产出 CANDIDATE，APPROVED 需架构师/产品负责人裁定。
3. Node 24.14 本机 EBADENGINE 警告延续（测试不受影响）。

## 6. 调度记录

| 时间 | 事件 |
| --- | --- |
| 14:50 | Wave 0 完成：基线核验、worktree ×4（integration 复用目录切至 phase-0.3/integration）、本计划落库 |
| 14:52 | Wave 1 启动：A（财务边界）‖ B（环境隔离）‖ C（UI 优化） |
