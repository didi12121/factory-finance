# WORKFLOW.md — 多 Agent 执行流程规范

> 来源：Phase 0.2 真实执行（Wave 0–5）。

## 执行波次（依赖驱动）

```text
Wave 0  主 Agent 初始化：能力检查、基线核验、worktree、任务 DAG、执行计划文档
Wave 1  基础加固（并行）：安全修复 / 共享契约与基础组件
Gate 1  契约审核 → 合并 → 冻结 PROTOTYPE_CONTRACT（此后 contracts 只读）
Wave 2  共享业务引擎（单任务）：Fixtures / Domain / 单一 Store
Gate 2  引擎验收 → 合并 → 主 Agent 注册路由/导航/页面 stub/端口隔离
Wave 3  页面开发（并行 ×N）：各 Agent 只写自己的 feature 目录
Wave 4  集成（合并顺序按依赖）→ 独立 QA → 缺陷回派修复轮（可并行）→ QA 复验
Wave 5  全量验证（前后端/E2E/生产构建/CI）→ 截图 → 交付报告 → 提交 → STOP
```

## Git 约定

- 集成分支 `phase-0.2/integration` 由主 Agent 独占；Agent 分支 `phase-0.2/agent-*`。
- 合并一律 `--no-ff` 留痕；Agent 分支基线必须是其依赖通过验收后的集成提交（页面 Agent 共用同一 Gate 提交）。
- Sub-Agent 禁止 push/合并他人分支/破坏性命令；修复轮需合并集成分支时由主 Agent 显式授权。
- 历史交付物（如往期截图）受保护：集成测试运行覆盖后立即从历史提交恢复。

## 契约变更

```yaml
request_id / requesting_agent / affected_files / current_contract /
requested_change / reason / impacted_agents / backward_compatibility / required_tests
```
主 Agent 裁决 → 指定唯一实现人 → 合并 → 更新契约版本（如 V1 → V1.1）→ 通知受影响 Agent → 重验证。

## 验收纪律

- 每个 Gate/STOP 条件逐项核验，禁止以"开发完成"替代验收。
- QA 结论独立于开发报告；P0/P1 必须修复后复验；P2/P3 记录处理结果与是否延期。
- 证据要求：实际命令 + 实际数字 + 真实浏览器输出；测试/截图端口与目录隔离。
