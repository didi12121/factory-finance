# BACKLOG —— Phase 1 前端（Agent C）交付记录与待办

> 本文件记录 Phase 1 前端改造中**删除或改写的过时测试规格**（逐条），
> 以及集成阶段需要跟进的适配项。过时判定口径：仅测试旧 Mock Store 交互、
> 或断言旧演示数据形态、且不再适用于真实 API 页面的规格。

## A. 删除的过时 E2E 规格（Phase 0.2 演示/Mock Store 交互，逐条记录）

| # | 规格 | 删除原因 | 替代 |
| --- | --- | --- | --- |
| A1 | `e2e/dashboard.spec.ts` | 全部用例断言演示看板（Mock Store 汇总/虚构数据/DEMO 基准日）；`/workbench` 已改为真实 API 页面（需登录 + 后端数据） | `e2e/phase1-acceptance.spec.ts`（经营概览真实数字断言） |
| A2 | `e2e/transactions.spec.ts` | 全部用例断言演示资金流水（Mock Store 查询/虚构流水/演示汇总口径）；`/treasury/transactions` 已改为真实 API 页面 | `e2e/phase1-acceptance.spec.ts`（流水搜索/筛选/详情/撤销信息） |
| A3 | `e2e/qa-cross-page.spec.ts` | 跨页流程基于 Mock Store 演示数据（看板↔流水↔应收↔收款单跳转断言虚构编号） | `e2e/phase1-acceptance.spec.ts`（登录→账户→出资→支出→转账→流水→概览→撤销） |
| A4 | `e2e/qa-regression.spec.ts` | 回归断言基于 Mock Store 演示数据形态（虚构汇总数字、演示单据编号） | `e2e/phase1-acceptance.spec.ts` + 各 vitest 页面用例 |
| A5 | `e2e/qa-ui-review.spec.ts` | UI 复查清单驱动演示页面（`metric-fund-balance` 等旧演示 testid 与虚构数据断言） | `e2e/phase1-acceptance.spec.ts`（真实数据下的 UI 断言） |

## B. 改写的过时 Vitest 规格（逐条记录）

| # | 规格 | 改写内容 |
| --- | --- | --- |
| B1 | `src/app/app-shell.test.ts` | 原断言 Phase 0.2 演示路由行为（Mock Store 页面可达、导航分组 3 处「规划中」）。Phase 1 改写为：登录守卫语义（未登录→`/login?redirect=`）、正式业务入口（资金账户/股东出资/支出录入/转账录入/客户/股东）、分组级「规划中」计数 2（基础资料已有实现项）。会话播种走 `stores/auth` 真实恢复链路，守卫认证提供者由测试显式装配（`setAuthGuardStateProvider`）。 |

## C. 保留但需集成阶段适配的 E2E 规格（逐条记录，本阶段未运行）

> 这些规格测试的是仍然有效的壳层/隔离能力，但其导航目标（`/workbench`、
> `/treasury/transactions`）已改为「需登录 + 真实数据」页面，且部分断言引用
> 旧演示 testid/虚构数字。集成阶段（全栈 + 种子账号）按下列要点适配后运行。

| # | 规格 | 适配要点 |
| --- | --- | --- |
| C1 | `e2e/shell.spec.ts` | 增加登录前置（`phase1-helpers.login`）或改走免登录的演示路由（build:test 下 `/business/receivables`）；`/workbench` 内容断言改为真实指标（`metric-fundBalance`）或空/错误态断言 |
| C2 | `e2e/keyboard.spec.ts` | 同 C1：登录前置；键盘遍历目标页的可聚焦元素集合随真实页面结构调整 |
| C3 | `e2e/mobile.spec.ts` | 登录前置；移动端无横向溢出检查目标页改为真实页面（加载完成态以表格/错误态为准） |
| C4 | `e2e/layout-audit.spec.ts` | `ready` testid 更新：`metric-fund-balance` → `metric-fundBalance`；`transactions-table` 仍有效但需登录；建议增加 accounts/contributions/expenses/transfers 页面 |
| C5 | `e2e/date-inputs.spec.ts` | `/treasury/transactions` 演示日期筛选断言改为真实 API 筛选（无数据时空态）；登录前置 |
| C6 | `e2e/data-table.spec.ts` | 表格排序/分页交互断言基于演示数据规模；改为真实页面（服务端分页下仅当前页排序）或在种子数据下重写断言 |
| C7 | `e2e/screenshots.spec.ts` | 截图清单中看板/流水页需登录 + 种子数据；旧演示截图基线作废，需重新出图（真实数据、明确标记测试账号数据） |
| C8 | `e2e/visual.spec.ts` | 视觉基线全部是演示数据页面快照，作废重建；登录前置 + 稳定种子数据（避免随机后缀入镜） |
| C9 | `e2e/isolation.spec.ts` | 生产构建下 `/workbench` 现为真实页面（未登录回退 `/login`，不再是安全占位页直接可见）；「演示路由安全回退」断言仍有效（`/business/*` 演示路由回退），但回退目标断言需同步 `/workbench` 新语义 |
| C10 | `e2e/prod-guard.spec.ts` | 同 C9：`/workbench` 未登录态断言改为 `/login` 回退（守卫语义），占位页断言改走 `/business/*` 或登录后验证 |

## D. 功能性待办（非本阶段范围/需架构师确认）

| # | 事项 | 说明 |
| --- | --- | --- |
| D1 | 应收相关区域「待开通」 | 经营概览「当前应收余额」标注待开通、不显假数字；应收 API 开通后接入（Phase 2） |
| D2 | 服务端排序 | 资金流水契约仅分页+筛选（无排序参数）；表格排序为当前页内排序，服务端排序待契约补充 |
| D3 | E2E 运行环境 | 集成阶段需为 preview/dev server 打通 `/api/v1` 代理或配置 `VITE_API_BASE_URL`，并提供种子管理员（`PHASE1_E2E_USERNAME/PASSWORD`） |
| D4 | DTO 字段对齐 | 前端 DTO 按 `docs/API_CONTRACT.md` 第 10 节 + `docs/DATABASE_DESIGN.md` 命名（如 `AuthUser.displayName`、`FundAccount.currentBalance`、撤销信息 `voidedAt`）；集成阶段与后端 A/B 实际返回逐字段核对 |
