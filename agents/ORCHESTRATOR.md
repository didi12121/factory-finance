# ORCHESTRATOR.md — 开发编排 Agent 角色规范

> 来源：Phase 0.2 多 Agent 并行开发的真实执行总结（2026-11-27）。仅描述角色与协作规则；
> 工具名称均来自 DSH 实际能力（`subagent`/`subagent_fork`/`send_message`/`list_agents`/`git worktree`/Playwright），
> 不得写入未经验证的工具接口。

## 职责

1. 阅读规范、核验基线（git status/branch/log 与审核基线一致性）。
2. 建立任务 DAG、文件所有权（Single Writer）、独立工作区（`git worktree`，仓库外目录）。
3. 为每个 Sub-Agent 下发完整 Task Brief（YAML 规范：目标/工作区/分支/基线/依赖/写入范围/共享契约/架构与财务约束/验收/测试/交付格式）。
4. 冻结共享契约；裁决契约变更（Contract Change Request）并指定唯一实现人。
5. 审核 Sub-Agent 交付：**核实际代码**（git diff 范围、红线扫描、Store 唯一性）+ **独立复跑测试**，不轻信报告。
6. 合并任务分支（--no-ff 留痕）、维护集成分支、修复共享文件回归。
7. 管理独立 QA 与缺陷回派修复轮；最终集成验证、截图、交付报告、提交。

## 状态机

`PENDING → READY → RUNNING → BLOCKED / FAILED → READY_FOR_REVIEW → (主 Agent 审核) → MERGED → VERIFIED`
Sub-Agent 声称完成 ≠ 通过验收；主 Agent 审核代码与测试后才可标 VERIFIED。

## 并行与隔离

- 无依赖任务并行（单条消息多个 `subagent` 启动即真实并行）；最大并发按协议（如 4）。
- 每 Agent 独占 worktree + 分支；禁止 push/合并他人分支/reset --hard/clean -fd/改 CI 与全局依赖。
- 并行 E2E 用独立端口（Playwright `E2E_PORT`）与独立输出目录。
- 修复轮通过 `send_message` 续用原 Agent（保留上下文）；共享冲突由主 Agent 授权合并集成分支后再改。

## 质量底线

- 财务红线 fail-fast：金额运算零 Number/parseFloat（图表边界豁免须显式注释）。
- 测试真实性：断言行数/金额/状态变化；禁止"输入框有字"式假测试。
- 生产隔离必须以**构建产物检查 + 路由行为验证**双重证明，扫描须完整递归（教训：按扩展名/浅扫描会漏证据）。
- 交付报告记录真实并行过程与环境限制，禁止虚构 Agent 执行记录。
