# MVP 最终业务修复 — 交付报告

> 审核基线：`cfe7cb02a43e4f2113b35ea5bc52f392b701006e`
> 结论：`MVP = READY_FOR_REAL_DATA_MIGRATION`

---

## 1. 修复数据迁移路由（§1）

- 现象：`ImportView.vue` 已实现，但 `frontend/src/router/index.ts` **未注册** `/business/import`（上一轮 PowerShell 批量替换未生效且未校验），侧边栏入口点击后落到占位/404。
- 修复：在鉴权子路由中补注册 `business/import`（`meta: { title: '数据迁移', requiresAuth: true }`）。
- 真实验证：新增 Playwright `e2e/import.spec.ts`——真实浏览器登录后从侧边栏点击「数据迁移」→ 断言 URL `/business/import` → 下载模板（校验 `.xlsx` 文件名）→ 上传（运行时生成最小 xlsx，见 `e2e/xlsx-fixture.ts`）→ 预览（校验「可导入」）→ 确认导入（校验「成功」与批次号 `IMP-`）→ 客户管理列表可见导入结果。

## 2. 财务导入幂等改为「原始记录标识」驱动（§2）

**问题**：原实现以「行内容哈希」作为幂等键，两笔内容完全相同但独立发生的业务（同日同账户同内容同金额）会被误判为重复而跳过。

**修复**（Flyway `V6__import_source_ref_recovery.sql`，未修改历史迁移）：

| 项 | 实现 |
| --- | --- |
| 原始记录标识 | 财务模板（出资/支出/应收/回款）新增必填列「原始记录标识」（≤64 字符，取自原始 Excel 的流水号/单号/行标识） |
| 财务幂等键 | `以「模板 + 原始记录标识」派生`：同标识 → 同幂等键；内容相同 → 重复跳过；内容不同 → **明确冲突提示** |
| 内容相同但标识不同 | 两笔业务各自入账（核心验收） |
| 主数据去重 | 客户/供应商/股东/资金账户仍按**业务名称**去重，与财务业务去重逻辑完全分离 |
| 文件级防护 | 保留：模板 + 文件 SHA-256 唯一，重复确认直接返回既有批次 |
| 可追溯 | 每行记录 `source_ref` / `content_hash` / 业务单据类型与主键；冲突提示中含既有单据号 |
| 批次恢复 | 确认导入先落库全部行（`PENDING` + `row_values` JSON）再逐行执行回写；新增 `POST /api/v1/import/batches/{id}/resume` 只重跑 `PENDING`/`FAILED` 行，已成功行不参与（不重复记账）。前端批次记录新增「恢复未完成行」按钮 |

**核心验收（自动化用例 `ExcelImportIT.identicalContentWithDifferentSourceRefsBothPosted`）**：
两笔 500 元支出，日期/账户/内容/金额完全相同、原始记录标识不同 →
生成 **2 条支出 + 2 条资金流水**，账户余额 5000 → 4000（总支出 1000）；
再次导入（同文件）→ `reused=true`，余额仍 4000；另一份文件含同样两条 + 1 条新记录 → 旧 2 条判定重复跳过、仅新记录入账（余额 3900）。

配套用例：`sameSourceRefWithDifferentContentReportsConflict`（同标识不同内容 → 预览与导入均提示冲突、不产生单据）、
`resumeImportsUnfinishedRowsWithoutDoublePosting`（失败行补建主数据后恢复 → 仅补入缺失行，重复恢复余额不变）。

## 3. 采购关联并发保护（§3）

- **统一锁**：新增 `ExpenseMapper.selectByIdForUpdate`（`SELECT … FOR UPDATE`）与 `FundFlowPort.lockPurchaseExpense`。
  - 「创建关联应付单」：`PayableService.create` 先锁采购支出行 → 校验状态/金额/重复关联 → 写入应付单（同一事务）。
  - 「撤销采购支出」：`VoidService.voidExpense` 先锁采购支出行 → 撤销守卫读取有效关联 → 撤销并写反向流水（同一事务）。
  - 两者共用同一行锁，串行执行；守卫由事务内已持有的锁保护（避免 treasury↔payable 循环依赖）。
- **并发用例** `PurchasePayableLinkIT.concurrentVoidAndLinkNeverLeavesVoidedExpenseLinked`：
  并发「创建关联应付单」与「撤销支出」→ 只允许一方成功；成功方状态一致，断言不存在「已撤销支出仍关联有效应付单」。

## 4. 测试与验证结果

| 套件 | 结果 |
| --- | --- |
| 后端 `mvn verify`（真实 MySQL 8.4） | ✅ **99/99**（单测 38 + 集成 61；新增/更新导入用例 9 例、采购关联并发 1 例） |
| 前端 `type-check` | ✅ 通过 |
| 前端 `vitest run` | ✅ **453/453** |
| Playwright（真实浏览器 + 真实后端） | ✅ **62/62**（含新增 `import.spec.ts`） |
| 生产隔离扫描 | ✅ `forbidden_total_hits=0` |

## 5. 交付物

- 代码：`frontend/src/router/index.ts`、`frontend/e2e/{import.spec.ts,xlsx-fixture.ts}`、
  `backend/.../V6__import_source_ref_recovery.sql`、`importer/**`（模板/服务/控制器/DTO/实体/Mapper）、
  `treasury/**`（行锁、端口）、`payable/**`（创建锁、守卫）、测试 3 个类。
- 文档：本报告、`docs/DECISION_LOG.md` 追加 3 条决策。

## 6. 已知限制（记录 Backlog）

- P3：财务模板现要求「原始记录标识」必填，历史导入文件需补该列（旧文件导入会明确提示缺列）。
- P3：恢复操作对同一批次并发调用没有批次级互斥（依赖行级幂等与业务幂等保证不重复记账），本地/单管理员场景可接受。
- P3：批次行 `row_values` 仅对新版本批次写入；V6 之前的旧批次无法恢复（提示重新导入）。

## 7. 停止条件

```text
IMPORT_ROUTE               = PASS   （路由注册 + 真实浏览器侧边栏进入并完成全流程）
IMPORT_FINANCIAL_IDEMPOTENCY = PASS （原始记录标识幂等：同内容不同标识各自入账、同标识不同内容冲突）
IMPORT_RECOVERY            = PASS   （PENDING 落库 + resume 只重跑未完成行，成功行不重复记账）
PURCHASE_LINK_CONCURRENCY  = PASS   （统一采购支出行锁 + 并发用例）
CORE_CI                    = PASS   （见 CI 运行结果）
MVP                        = READY_FOR_REAL_DATA_MIGRATION
```
