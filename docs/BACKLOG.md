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

## Phase 1 集成阶段退役/适配记录（主 Agent，2026-11-27）

- **E2E 退役** `qa-idempotency.spec.ts`：测试对象为 Phase 0.x Mock Store 的收款/核销流程（原型页已由真实 API 页面替换）；其覆盖语义（重复确认幂等、同键异参 CONFLICT、分隔符冲突场景）已由后端 `ContributionIT/ExpenseIT/TransferIT`（幂等+并发）与 `phase1-acceptance.spec.ts` 全 UI 流程覆盖。
- **E2E 退役** `screenshots.spec.ts`：Phase 0.2/0.3 交付截图已生成并归档（`artifacts/screenshots/phase-0.2|0.3/`）；Phase 1 按任务不要求全量截图（仅关键业务页面截图，见交付报告）。其页面交互断言由 `phase1-acceptance.spec.ts` 覆盖。
- **CORS 集成修复**：浏览器 POST 携带 Origin（Playwright 预览端口）被 CORS 过滤器 403；修复为 dev/test 允许本机回环来源模式（生产保持严格白名单），`CorsPolicyIT` 增补断言。
- **报表查询日期语义修正**：dashboard/transactions 查询区间不再拒绝未来结束日（业务写日期仍强制 ≤ 当前业务日期）；根因=前端本月区间结束日为月末。
- **全局登录态**：e2e 注入 storageState（global-setup 登录），phase1-auth 自行清空测登录流程。

---

## D. Phase 2（应收应付与核销）测试规约调整

> 判定口径：仅在**被测实现已不存在**（原型内存 Store 被真实 API 取代）或**断言语义依赖演示夹具**
> （固定基准日、固定行数、示例客户）时调整；真实业务红线（幂等、核销不超额、跨客户/供应商、
> 撤销可追溯）全部保留并在新规约中加强。

### D1. 删除的原型驱动规格（替换为真实业务规格）

| # | 规格 | 删除原因 | 替代 |
| --- | --- | --- | --- |
| D1-1 | `src/features/receivables/ReceivableDetailView.test.ts` | 断言 `usePrototypeStore` 派生的演示数据（ar-004 / rc-003 固定金额） | `e2e/receivables.spec.ts`（真实详情页 + 真实应收单 id）、`src/features/business/businessStore.test.ts`（派生口径） |
| D1-2 | `src/features/receipts/receipts-flow.test.ts` | 直接驱动内存 Mock Store 的核销引擎（resetDemoData、fixture 编号） | `src/features/business/businessStore.test.ts` + `e2e/receipts.spec.ts` + `e2e/phase2-acceptance.spec.ts`（场景一：8000+7000 核销） |
| D1-3 | `src/features/receipts/receipts-guard.test.ts` | 上述 Mock Store 的守卫用例（示例客户 A–E、未分配/超额由 Mock 判定） | `e2e/phase2-acceptance.spec.ts`（超额/跨客户/未全额核销/幂等/撤销，均由真实后端判定） |
| D1-4 | `src/features/receipts/receiptsTestHarness.ts` | 仅服务于已删除的 Mock Store 用例 | —（真实 API 测试改用 `services/api/testAdapter`） |

### D2. 改写为真实数据的 E2E 规格

| # | 规格 | 调整内容 |
| --- | --- | --- |
| D2-1 | `e2e/date-inputs.spec.ts` | 固定基准日 2026-11-30 与固定行数（共 24/18 条）改为真实业务日期与组件行为断言；删除依赖 Mock 行数的区间计数断言 |
| D2-2 | `e2e/layout-audit.spec.ts` | 就绪 testid 更新（`metric-fundBalance`/`receipt-list`）；长金额用例改用 API 创建的真实客户与当前月份 |
| D2-3 | `e2e/shell.spec.ts` | 详情页导航高亮改用真实应收单 id；「规划中」分组数 3 → 2（应付账款/供应商已交付） |
| D2-4 | `e2e/receivables.spec.ts`、`e2e/receipts.spec.ts` | 由 Mock 交互改写为真实后端业务流（新建应收 → 列表/详情 → 回款登记 → 全额核销限制） |

### D3. 新增真实业务规格

| 规格 | 覆盖 |
| --- | --- |
| `backend/.../receivable/ReceivableAndReceiptIT.java` | 确认应收不动资金、一收多销、一销多次、超额/跨客户/未全额拒绝且零变化、幂等、并发不超额、撤销恢复与可追溯、未来会计月份拒绝 |
| `backend/.../payable/PayableAndPaymentIT.java` | 确认应付不动资金、部分付款、多单核销、超额/跨供应商/未全额拒绝、支出单直接支付禁止重复付款、撤销恢复、付款幂等 |
| `frontend/src/features/business/businessStore.test.ts` | 前端真实 API 接线（幂等键透传、派生口径、失败不回退 Mock） |
| `frontend/e2e/phase2-acceptance.spec.ts` | 场景一/二 + 幂等 + 超额/跨客户/未全额 + 撤销 + 非法金额（真实浏览器 + 真实数据库） |
| `frontend/e2e/payables` 相关用例（含于 phase2-acceptance） | 应付列表 → 付款对话框 → 核销明细 → 余额变化 |

## E. Phase 2 遗留（P2/P3，不阻塞主线）

| 级别 | 事项 | 说明 |
| --- | --- | --- |
| P2 | 回款/付款“按到期日自动分配”仅回款侧提供，付款侧仅提供手动核销与预览 | 任务仅要求回款自动分配；付款侧自动分配可作为后续增强 |
| P2 | 应收/应付列表分页在内存完成（派生状态/逾期筛选需全量派生） | 数据量增大后需改为 SQL 侧派生或物化列；当前工厂规模可接受 |
| P2 | `docker compose` 容器重启持久化验证未在本会话执行 | 本机 Docker 守护进程不可用；Compose 配置已补齐 `ADMIN_INITIAL_PASSWORD` 并由 CI `compose-config` Job 校验 |
| P3 | 应收/应付撤销暂无独立「撤销单号」展示页 | 撤销单号与撤销日期已在单据视图返回，可由详情页后续补充 |
| P3 | 供应商缺少地址字段（与客户主数据不对称） | 任务要求最小可用字段集 |