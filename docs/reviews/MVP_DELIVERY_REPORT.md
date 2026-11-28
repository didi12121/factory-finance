# MVP 上线准备交付报告

> 生成时间：2026-11-28（Asia/Shanghai）
> 审核基线：`9500b4499adfc38fcedafa7c4b9c64d7ca8edfa5`（Phase 2 交付）
> 阶段结论：`MVP = READY_FOR_REVIEW`；`PHASE_3_STARTED = NO`；`REAL_DATA_IMPORTED = NO`

---

## 1. 已完成业务

### 1.1 采购支出 ↔ 应付单关联完整性（§1）

- **数据库约束**：新增 Flyway `V4__purchase_payable_link_integrity.sql`——`pay_payable` 增加 STORED 生成列
  `funded_expense_key = CASE WHEN funded_expense_id IS NOT NULL AND status='CONFIRMED' THEN funded_expense_id END`，
  并建唯一索引 `uk_pay_payable_funded_expense`。同一笔采购支出**最多关联一张有效应付单**；
  应付单撤销后生成列置 NULL（关联自动解除，可重新关联），历史 `funded_expense_id` 保留可追溯。
- **事务校验**：`PayableService.create` 在关联前 `SELECT … FOR UPDATE` 检查已有有效应付单 → 409；
  并发场景由唯一键最终拦截，`DuplicateKeyException` 按唯一键名区分后转 409（不误判为编号冲突）。
- **撤销守卫**：新增 SPI `treasury.api.FundDocumentVoidGuard`，应付模块实现 `PurchaseExpenseLinkGuard`。
  已关联有效应付单的采购支出撤销 → 409「该采购支出已关联有效应付单 YF-…，请先撤销该应付单后再撤销支出」。
  资金模块不反向依赖应付模块（守卫由 Spring 注入收集）。
- **前端**：应付单新增「关联已支付采购支出」下拉（候选由 `/payable/payables/fundable-expenses` 提供，
  已排除被引用者）；选中后自动填充金额/内容并锁定金额（必须等于支出金额），付款按钮对已由支出单支付的应付单禁用。
- **测试**：`PurchasePayableLinkIT`（5 例）——关联后 SETTLED 且不重复扣资金、重复关联 409、候选列表排除、
  撤销守卫 409 与撤销应付后可撤销支出、撤销后可重新关联、并发重复关联仅一笔成功。

### 1.2 Excel 数据迁移基础能力（§3）

- 新增 `importer` 模块（Flyway `V5__mvp_import_batch.sql`：`imp_batch` / `imp_batch_row`）。
- 8 类模板：客户、供应商、股东、资金账户及期初余额、股东出资、日常支出、应收账款、加工费回款。
- 流程：模板下载（`.xlsx`，含「填写说明」）→ 上传 → 解析 → 预览（字段/格式/引用校验、错误行原因、重复行识别）
  → 确认导入 → 批次记录 → 导入结果统计。
- **不绕过财务规则**：全部写入委托既有业务 Service（新增 `MasterdataWriteApi` / `TreasuryWriteApi` /
  `ReceivableWriteApi` 端口），复用编号生成、金额精度、事务、请求幂等与资金流水唯一性规则；
  导入器不直写任何业务表。
- **历史核销关系保留**：回款模板支持「核销对账单编号」与「核销金额」多值（英文逗号分隔、一一对应），
  导入后生成收款单 + 1 条资金流入 + N 条核销明细（一笔收款核销多张应收单的真实关系）。
- **重复导入防护**：文件级（模板 + SHA-256 唯一，重复确认返回既有批次且不重复记账）+
  行级（幂等键 = `imp` + SHA-256(模板+规范化行内容) 前 40 位；文件内相同内容行标记 DUPLICATE 跳过）。
- **失败零残留**：逐行独立事务——失败行不产生任何业务单据与资金流水，成功行记录业务单据类型与主键。
- **前端**：`/business/import`「数据迁移」页（模板选择与下载、上传预览、行级状态与错误原因、确认导入、批次记录、导入核对）。

### 1.3 财务核对（§4）

`GET /api/v1/import/reconciliation`：

- 各资金账户期初/当前余额、总资金余额；
- 各客户应收未收余额、总应收余额；
- 各供应商应付未付余额、总应付余额；
- 导入成功/失败/重复行数与批次数；
- 差异提示：负余额账户、存在失败行的批次、成功行缺业务单据主键等（**只提示，不自动清零、不修改原始金额**）。
- 口径：余额全部由真实数据重算（期初 + 有效流水 / 原始金额 − 有效核销），不读取导入批次金额，
  避免「期初余额与历史流水重复计算」；资金流水早于期初日期会被业务规则拒绝。

### 1.4 生产部署（§2）

- Compose 后端注入 `ADMIN_INITIAL_PASSWORD`；Nginx 增加 `client_max_body_size 12m`；后端 multipart 10MB/12MB。
- 新增 `docs/DEPLOYMENT.md`（简洁生产部署说明：环境变量、启动、验证清单、备份恢复、升级、Excel 迁移、常见问题）。

---

## 2. 核心测试结果

| 套件 | 结果 |
| --- | --- |
| 后端 `mvn verify`（真实 MySQL 8.4；单测 + 集成测试） | ✅ **95/95**（单测 38，集成 57；含新增 11 例：采购关联 5 + Excel 导入 6） |
| 前端 `npm run type-check` | ✅ 通过 |
| 前端 `vitest run` | ✅ **453/453** |
| 生产构建隔离扫描（`verify-isolation --mode production`） | ✅ `forbidden_total_hits=0`、chunk 名 0 命中、骨架对照 PASS |

关键用例覆盖：关联/重复关联/并发关联/撤销守卫/撤销后重关联；导入预览零写入、确认导入、同文件重复确认幂等、
无效行零残留、文件内重复行跳过、回款多单核销关系、核对结果与账户余额一致。

---

## 3. 部署验证结果（真实 Docker Compose）

环境：Windows 11 + Docker 29.4.3 + Compose v5.1.3，`docker compose build` 全新构建镜像，`down -v` 清空数据卷。

| 验证项 | 结果 |
| --- | --- |
| 全新数据库初始化 | ✅ 空库启动（`mst_customer=0 / tst_fund_account=0 / tst_fund_transaction=0`，仅 1 个 admin 用户） |
| Flyway 迁移 | ✅ `flyway_schema_history` V1–V5 全部 `success=1` |
| 管理员初始化与登录 | ✅ `POST /api/v1/auth/login`（经 Nginx 8088）返回 token |
| 前后端真实接口连接 | ✅ 经 Nginx 反向代理完成登录与全部业务写入；SPA 首页 200 |
| 登记出资/支出/应收/回款 | ✅ 经 8088 创建：CZ-202611-0001 / ZC-202611-0001 / YS-202611-0001 / SK-202611-0001；账户余额 12,800.00（1,000 期初 + 5,000 出资 − 1,200 支出 + 8,000 回款），流水 3 条，应收 `SETTLED/0.00` |
| 采购支出关联（部署态） | ✅ 候选列表含 ZC-202611-0001 → 关联生成 YF-202611-0001（SETTLED）；重复关联 409；撤销支出 409（提示先撤销应付单） |
| Excel 导入（部署态） | ✅ 模板下载 4.5KB（正确 MIME）→ 3 行（含 1 重复）预览 → 确认导入批次 `IMP-20261128-0001`（成功 2 / 重复 1）→ 重复确认返回同批次 `reused=true` → 核对统计一致 |
| 容器重启后数据保留 | ✅ `docker compose restart` 后三容器 healthy，客户/账户/流水/收款单/批次计数不变（3/1/3/1/1），可继续写入（新客户 CUS-0004） |
| 数据库备份与恢复 | ✅ `mysqldump`（42,861 bytes）→ 恢复到全新库 `factory_finance_restore` → 计数一致（客户 4 / 流水 6 / 核销 2 / 批次 1），随后清理恢复库 |
| 生产环境无演示财务数据 | ✅ 库内 `示例/虚构/演示` 关键字命中 0；生产前端产物 `示例客户`、`DEMO_TODAY` 命中 0 |

> 说明：本次真实 Docker 部署验证已完成（上一阶段因 Docker 守护进程不可用而未验证，本阶段环境已具备并实测通过）。
> 验证后已 `docker compose stop` 释放端口，数据卷保留。

---

## 4. Excel 导入方式

**入口**：登录后左侧导航「数据迁移」（`/business/import`）。

1. 选择模板 → 下载 `.xlsx`（模板含「数据」表与「填写说明」表；表头不可修改）。
2. 按说明填写：
   - 客户/供应商/股东：名称必填（同名视为重复，跳过）；
   - 资金账户：账户名称、类型（BANK/CASH/WECHAT/ALIPAY/OTHER 或中文）、期初余额、期初日期；
   - 出资：股东名称（须已存在）、出资日期、资金账户（须已存在）、金额；
   - 支出：分类（代码或中文）、内容、业务日期、付款账户、金额；工资须填员工名称与工资月份；
   - 应收：客户名称、所属月份、对账日期、到期日期（可空）、应收金额；
   - 回款：客户名称、实际到账日期、收款账户、实际收款金额、核销对账单编号（多个用英文逗号）、
     核销金额（与编号一一对应；本阶段要求合计等于实收）。
3. 上传 → **预览**（逐行显示「可导入/校验失败（原因）/重复（跳过）」，预览不写任何数据）。
4. **确认导入** → 逐行调用业务服务生成业务单据与资金流水；结果面板显示成功/失败/重复行数与单据主键。
5. **批次记录**与**导入核对**：查看历史批次、失败原因，核对账户/总资金/客户应收/供应商应付/导入统计。

**建议顺序**：客户/供应商/股东 → 资金账户（期初）→ 出资/支出 → 应收 → 回款。
**限制**：单文件 ≤ 10MB、单次 ≤ 5000 行；同一文件重复确认不会重复记账。

---

## 5. Git 与 CI

- Repository：https://github.com/didi12121/factory-finance
- Git Hash：`c86bd41`（`feat(mvp): 采购支出关联完整性、正式部署验证与 Excel 数据迁移`）；基线 `9500b44`
- CI：GitHub Actions `.github/workflows/ci.yml`
- **CI 运行（成功）**：https://github.com/didi12121/factory-finance/actions/runs/46117334904

| Job | 结果 |
| --- | --- |
| Backend（单测 + Testcontainers 集成测试） | ✅ success（95 tests，含 V4/V5 迁移与新增 11 例） |
| Frontend（类型检查 + Vitest + 生产构建） | ✅ success（453 tests） |
| Playwright E2E（真实浏览器 + 真实后端 + 生产构建防护） | ✅ success |
| Docker Compose 配置校验 | ✅ success |
| 生产环境隔离（production / staging / uat / demo-custom） | ✅ 4/4 success |
| 视觉回归候选基线（`continue-on-error`，信息模式） | ⚠️ failure（演示数据页面快照，任务明确不作为阻塞） |

---

## 6. 实际 Token 用量

- 本阶段累计输入/输出约 **0.55M** Token（估算：会话步骤 × 平均上下文；单 Agent 开发，未启用子 Agent）。
- 累计（Phase 2 + MVP）约 1.6M，仍在 500 万软预算内。

---

## 7. 已知阻塞与遗留

| 级别 | 事项 | 说明 |
| --- | --- | --- |
| 无 P0/P1 | — | 本阶段无阻塞上线的问题 |
| P2 | 导入模板间存在顺序依赖（如出资依赖股东/账户已存在） | 已在填写说明与部署文档中明确建议顺序；后续可提供「一键全量导入（依赖排序）」 |
| P2 | 导入不支持「解除关联/修改已确认单据」 | 关联解除通过撤销应付单完成（保留历史）；编辑已确认单据仍走撤销 + 重新登记 |
| P2 | 回款导入要求全额核销（与线上规则一致），未分配/预收不支持 | 与 Phase 2 业务规则一致，属既定范围 |
| P3 | 导入批次无分页（默认最近 20 条，可传 limit） | 数据量增大后可加分页与筛选 |
| P3 | Excel 仅支持 `.xlsx`（不支持 `.xls`/CSV） | 模板统一下载 .xlsx，降低解析歧义 |
| 待确认 | 实际用户 Excel 的字段映射、期初日期与历史数据范围 | 按任务要求等待架构师依据原始 Excel 文件确认后再实施（本阶段仅虚构数据验证） |

---

## 8. 停止条件核对

```text
PURCHASE_PAYABLE_INTEGRITY = PASS   （V4 生成列唯一键 + 事务校验 + 撤销守卫；IT 5 例 + 部署态实测）
EXCEL_IMPORT               = PASS   （8 模板全流程；IT 6 例 + 部署态真实导入）
FINANCIAL_RECONCILIATION   = PASS   （账户/总资金/客户应收/供应商应付/导入统计 + 差异提示；真实数据重算）
CORE_CI                    = PASS   （见 CI 运行结果）
REAL_DATA_IMPORTED         = NO     （仅虚构测试数据）
PHASE_3_STARTED            = NO
MVP                        = READY_FOR_REVIEW
```
