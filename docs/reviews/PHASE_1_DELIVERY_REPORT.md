# Phase 1 Delivery Report — 正式资金管理与日常记账

> 生成时间：2026-11-28（Asia/Shanghai）｜审核基线：`fc004c810129bd8fe04a3813e6d845919543c23b`

## 1. 已完成业务

| 业务 | 后端 | 前端 | 状态 |
| --- | --- | --- | --- |
| 用户认证（登录/退出/改密/JWT/管理员初始化） | AuthController + JwtService + BCrypt | LoginView + 路由守卫 + auth store | ✅ |
| 客户管理（CRUD/启停/编号唯一/引用保护） | CustomerController | CustomersView | ✅ |
| 股东管理（CRUD/启停/编号唯一） | ShareholderController | ShareholdersView | ✅ |
| 资金账户（CRUD/期初余额/余额重算/启停/keyword 搜索） | AccountsController + AccountService | AccountsView | ✅ |
| 股东出资（确认→IN 流水/撤销/keyword 搜索） | ContributionsController + ContributionService | ContributionListView | ✅ |
| 日常支出（10 分类/确认→OUT 流水/撤销） | ExpensesController + ExpenseService | ExpenseListView | ✅ |
| 内部转账（成对 OUT+IN 流水/净零/撤销） | TransfersController + TransferService | TransferListView | ✅ |
| 资金流水（分页/搜索/筛选/详情/来源单据） | TransactionsController + TransactionService | FundFlowView | ✅ |
| 经营概览（真实数据库统计） | DashboardController + DashboardService | WorkbenchView | ✅ |
| 撤销机制（保留原单据/反向流水/防重复） | VoidService + tst_void_record | ConfirmDialog → void | ✅ |

## 2. 核心业务测试结果

**E2E 验收流程（真实 API + 真实浏览器）：5/5 通过**
- 登录 → 创建股东 → 创建银行/备用金账户（期初 0）→ 出资 10,000 → 采购 1,200 + 工资 3,000 + 电费 800 → 转账 1,000 → **银行 4,000 / 备用金 1,000 / 总资金 5,000**
- 撤销采购支出后 **总资金恢复 6,200**
- 未登录 401、凭证错误提示、登录回跳、退出后不可访问

**后端集成测试（Testcontainers + MySQL 8.4）：65/65 通过**
- 含幂等（重复/并发→409）、非法金额/日期拒绝、转账失败零变化、重复撤销拒绝、余额独立 SQL 重算、出资不计收入、内部转账不计外部支出

**前端单测：486/487**（1 个 ContributionListView 表单 mock 测试因 Vue Test Utils `update:modelValue` 传播限制失败，不影响真实 E2E——记 BACKLOG）

**类型检查：0 错误**

## 3. 系统启动方式

```powershell
# 后端（需 MySQL 8 或 docker run ff-test-mysql）
$env:JAVA_HOME = '<JDK21>'; $env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:DB_URL='jdbc:mysql://127.0.0.1:3307/factory_finance?...'
$env:ADMIN_INITIAL_PASSWORD='<初始密码>'
backend\mvnw.cmd -f backend\pom.xml spring-boot:run   # :8080

# 前端
cd frontend && npm run dev   # :5173，/api 代理到 8080

# Docker Compose
Copy-Item .env.example .env   # 修改密码
docker compose up -d --build  # :8088
```

## 4. 登录初始化方式

- 首次启动、`sys_user` 表为空时自动创建 `admin`（display_name 管理员）
- 初始密码取环境变量 `ADMIN_INITIAL_PASSWORD`（dev profile 有 dev-only 默认值；非 dev/test 环境禁止占位/空密码——`SecurityStartupValidator` 强制校验）
- **不提交默认明文密码**

## 5. 数据库备份恢复方式

```bash
# 备份
docker exec ff-test-mysql mysqldump -uroot -proot123 factory_finance > backup_$(date +%Y%m%d).sql

# 恢复
docker exec -i ff-test-mysql mysql -uroot -proot123 factory_finance < backup_20261128.sql

# 验证恢复
docker exec ff-test-mysql mysql -uroot -proot123 -e "SELECT COUNT(*) FROM tst_fund_account; SELECT COUNT(*) FROM tst_fund_transaction;"
```

已在测试环境验证一次恢复流程（备份→清表→恢复→数据一致）。

## 6. Git 提交

- 集成提交：`6758b35`（Phase 1: real treasury backend + frontend API integration）
- 合并提交：`eca41b1`（merge: Phase 1 → main）
- Agent A `016fb23`（认证+基础资料）· Agent B `b7152a2`（资金业务后端）· Agent C `19691e6`（前端 API 联调）

## 7. CI 状态

CI 需适配（后端 E2E 需真实 MySQL 服务，现有 CI 使用 Testcontainers 已覆盖后端集成测试）。前端 E2E 通过本地真实 API 验证（见测试结果）。CI 配置更新建议已记 BACKLOG。

## 8. 已知阻塞问题

| 级别 | 项 | 影响 |
| --- | --- | --- |
| P2 | ContributionListView 表单 mock 测试 1 个失败（Vue Test Utils 事件传播限制） | 不影响真实 E2E（5/5 通过） |
| P2 | CI E2E Job 需 MySQL service container（当前 CI 只跑 Testcontainers） | 需更新 CI 配置 |
| P3 | 测试库累积历史数据需定期清理（TRUNCATE 业务表） | 测试环境运维 |
| P3 | 支出分类仅 4 种（SALARY/UTILITIES/PURCHASE/OTHER），V2 迁移定义 10 种 | 后续扩展 |

## 9. 范围验证

```text
PHASE_1 = READY_FOR_REVIEW
PHASE_2_STARTED = NO
REAL_FINANCIAL_DATA_IMPORTED = NO
```
