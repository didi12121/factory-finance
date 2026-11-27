# CANDIDATE_BASELINE — Phase 0.3 视觉回归候选基线

> **状态：CANDIDATE（未批准）**——必须由架构师与产品负责人审核后方为 APPROVED_BASELINE。
> 开发 Agent 不得自行宣布视觉验收完成；后续视觉差异必须经评审，禁止批量更新快照消差。

## 生成方式

- 套件：`frontend/e2e/visual.spec.ts`（13 个视图，交互生成业务状态）
- 配置：`frontend/playwright.visual.config.ts`（固定 Locale=zh-CN、Timezone=Asia/Shanghai、视口、动画禁用、截图前 fonts.ready + scrollTop=0）
- 生成：`npm run test:visual:update`；验证：`npm run test:visual`（生成后本地比对 0 差异）
- **生成平台**：Windows 10 x64 / Playwright 1.65.1（锁定 Chromium）/ 本地 npm 字体包（Inter Variable + Noto Sans SC）
- 演示数据：确定性 Fixtures + DEMO_TODAY=2026-11-30（无随机、无真实时间）

## 平台敏感性（评审须知）

快照按 Playwright 规范带平台后缀（`*-win32.png`）。跨平台（Linux CI）字体渲染存在
亚像素级差异——属预期现象，评审 APPROVED 时应裁定基线平台（建议后续在稳定
Linux 容器中重生成平台匹配基线后启用 CI 强制比对；当前 CI 视觉 Job 为
continue-on-error 信息模式，上传各平台快照供对比评审）。

## 覆盖视图（13）

dashboard / transactions-list / transaction-detail / receivables-list /
receivable-detail / create-receivable / receipt-list / receipt-allocation /
receipt-allocation-error / receipt-allocation-success / dashboard-mobile /
receivables-mobile / receipt-allocation-mobile
