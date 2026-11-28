# Factory Finance — 开发环境与进度交接记录

> 生成时间：2026-11-28 10:32（Asia/Shanghai）
> 用途：新会话交接，快速恢复开发上下文。请新会话优先阅读本文件 + `AGENTS.md`。

---

## 1. 项目概览

**Factory Finance（工厂财务管理系统）** —— 面向小型注塑加工工厂的轻量级财务管理系统，替代现有 Excel 账目管理。

**核心产品原则**：用户录入真实业务，系统执行财务规则、生成凭证、计算余额及统计报表。

**当前阶段**：Phase 1 已完成（READY_FOR_REVIEW），等待架构师审核后进入 Phase 2。

**Repository**: https://github.com/didi12121/factory-finance.git

**审核基线（Phase 2 前）**: `5b98c1260b577abac65a3908058b2e35d8d8309b`

---

## 2. 开发环境

### 2.1 本机工具链（Windows 10 x64）

| 工具 | 版本/路径 | 备注 |
| --- | --- | --- |
| JDK 21 | `C:\Users\陈\.jdks\dragonwell-ex-21.0.10` | JAVA_HOME 指向此路径 |
| Maven Wrapper | `backend/mvnw.cmd`（Maven 3.9.11） | 无需全局 Maven |
| Node.js | v24.14.0 | engines 要求 `^22.22.2 \|\| >=24.15.0`（EBADENGINE 警告，不影响运行） |
| npm | 11.9.0 | |
| Docker Desktop | 29.4.3 | Testcontainers 与 Compose 需要 |
| Git | 2.45.1 | |
| MySQL（测试容器） | `ff-test-mysql`（mysql:8.4，端口 3307） | 测试用临时容器，可重建 |

### 2.2 PowerShell 启动模板

```powershell
# 后端
$env:JAVA_HOME = 'C:\Users\陈\.jdks\dragonwell-ex-21.0.10'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:SPRING_PROFILES_ACTIVE='dev'
$env:DB_URL='jdbc:mysql://127.0.0.1:3307/factory_finance?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8&allowPublicKeyRetrieval=true'
$env:DB_USERNAME='factory'
$env:DB_PASSWORD='app123'
$env:ADMIN_INITIAL_PASSWORD='admin123'
& 'D:\env\factory-finance-worktrees\integration\backend\mvnw.cmd' -B -f 'D:\env\factory-finance-worktrees\integration\backend\pom.xml' spring-boot:run

# 前端
cd D:\env\factory-finance-worktrees\integration\frontend
npm run dev   # :5173，/api 代理到 :8080
```

### 2.3 Git Worktree 结构

```
D:\env\Factory Finance                    ← 主仓库（main）
D:\env\factory-finance-worktrees\
├── integration/                          ← 集成工作区（当前活跃开发）
├── agent-a-core/                         ← Phase 1 Agent A（认证+基础资料）
├── agent-b-treasury/                     ← Phase 1 Agent B（资金业务）
├── agent-c-frontend/                     ← Phase 1 Agent C（前端联调）
└── (Phase 0.x 历史 Agent worktree，可清理)
```

**新会话建议**：直接在 `D:\env\Factory Finance`（主仓库）或 `integration` 工作区继续开发。

---

## 3. 技术栈与架构约束

### 3.1 强制技术栈（锁定版本，禁止更换）

**后端**：Java 21 / Spring Boot 3.5.16 / Maven Wrapper / MyBatis-Plus 3.5.18 / MySQL 8.4 / Flyway 11.7.2（flyway-mysql）/ Spring Security + BCrypt / JJWT 0.12.7（HS256 白名单）/ Jakarta Validation / OpenAPI 2.10.1 / JUnit 5 / Testcontainers 1.21.4

**前端**：Vue 3.5.46 / TS 5.9.3 strict / Vite 7.3.8 / Vue Router 4.6.5 / Pinia 3.0.4 / shadcn/vue（reka-ui 2.11.0 + cva + tailwind-merge）/ Tailwind CSS 4.3.5 / TanStack Table 8.21.3 / Lucide（@lucide/vue 1.81.0）/ ECharts 6.1.0 / Axios 1.21.1 / Vitest 4.1.12 / Playwright 1.65.1

**基础设施**：Docker Compose / Nginx / GitHub Actions（6 类 CI Job）

**禁止引入**：微服务、Redis、Nacos、Dubbo、Kafka、K8s、Admin 模板、额外 UI 组件库。

### 3.2 架构

- **模块化单体**（Modular Monolith）：单 Spring Boot + 单 MySQL，12 业务模块（identity/masterdata/treasury/receivable/payable/expense/shareholder/fixedasset/accounting/reporting/attachment/audit）
- **模块边界**：业务模块只依赖 common/infrastructure；模块间经 api 包协作；禁止跨模块查表
- **统一基础设施**：ApiResponse / ErrorCode / PageQuery·PageResult / GlobalExceptionHandler / TraceIdFilter

### 3.3 财务红线（docs/ACCOUNTING_RULES.md）

- **金额**：Java BigDecimal / DECIMAL(18,2) / 十进制字符串传输 / 禁止 float·double·JS Number / BigInt 定点前端运算（utils/decimal.ts）
- **复式记账**（Phase 3+）：借贷平衡、可追溯、已过账不可改删、冲销更正
- **业务分离**：营业收入≠实际收款、经营费用≠实际付款、股东出资≠营业收入、内部转账≠收支
- **审计**：唯一单据编号、多时间维度、操作人记录

### 3.4 UI 设计规范

- 唯一参考：Stripe Dashboard
- Design Tokens：`frontend/src/styles/tokens.css`（颜色/排版/布局，含语义 foreground Token）
- 金额展示：千分位、两位小数、tabular-nums、表格右对齐、指标区左基线
- 禁止：渐变/玻璃拟态/阴影堆砌/营销文案/Emoji 图标/卡片堆砌

---

## 4. 进度记录

### 4.1 已完成阶段

| 阶段 | 状态 | 核心交付 |
| --- | --- | --- |
| Phase 0.1 | ✅ | 工程骨架、后端基础设施、前端初始化、Docker Compose、文档体系 |
| Phase 0.1.1 | ✅ | JWT 白名单、AmountInput、环境隔离、UI 优化、候选视觉基线 |
| Phase 0.2 | ✅ | Mock Store 引擎、12 页面原型、多 Agent 并行开发机制 |
| Phase 0.3 | ✅ | 财务边界整改、环境隔离强化、UI 产品优化、独立 QA |
| **Phase 1** | ✅ | **真实数据库持久化、认证、基础资料、资金账户/出资/支出/转账/流水/概览/撤销** |

### 4.2 Phase 1 核心验收（已通过）

```
出资 10,000 → 采购 1,200 + 工资 3,000 + 电费 800 → 转账 1,000
= 银行 4,000 / 备用金 1,000 / 总资金 5,000
撤销采购后 = 总资金 6,200
后端集成 65/65 | 前端 E2E 5/5 | 单测 486/487
```

### 4.3 已知遗留问题

| 级别 | 问题 | 影响 |
| --- | --- | --- |
| P2 | ContributionListView 表单 mock 测试 1 个失败（Vue Test Utils 事件传播限制） | 不影响 E2E |
| P2 | CI E2E Job 需要 MySQL service container | 需更新 CI 配置 |
| P3 | 测试库累积数据需定期 TRUNCATE | 测试环境运维 |
| P3 | 支出分类仅 4 种（V2 定义 10 种） | 后续扩展 |
| P3 | 长客户名 fixture、OperationDateTimeInput 待业务接入 | UI 完善 |

---

## 5. Phase 2 待开发（下一阶段）

**应收应付与加工费回款核销**：

- 加工费对账单（多月份、多客户）
- 应收账款管理（应收余额=原始应收−有效核销）
- 回款登记 + 多对多核销（receipt_allocation）
- 应付账款 + 付款核销
- 股东借款/垫资/分红（区别于出资）
- 数据库扩展（应收/应付/核销表）
- API + 前端页面

**开始前必须**：读取 `docs/ACCOUNTING_RULES.md` + `docs/PROTOTYPE_DATA_CONTRACT.md` + `AGENTS.md` + 本文件。

---

## 6. 快速恢复清单（新会话执行）

1. `git log --oneline -5` 确认 HEAD = `5b98c12` 或更新
2. 读取 `AGENTS.md` + `docs/ACCOUNTING_RULES.md` + `docs/PROTOTYPE_DATA_CONTRACT.md`
3. 启动测试 MySQL：`docker run -d --name ff-test-mysql -e MYSQL_ROOT_PASSWORD=root123 -e MYSQL_DATABASE=factory_finance -e MYSQL_USER=factory -e MYSQL_PASSWORD=app123 -p 3307:3306 mysql:8.4`
4. 启动后端（见 2.2）→ `curl http://127.0.0.1:8080/api/v1/health`
5. 启动前端（见 2.2）→ 浏览器打开 `http://localhost:5173`
6. 登录：admin / admin123（dev 环境）
