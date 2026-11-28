# Factory Finance — 开发环境与进度交接记录

> 生成时间：2026-11-28 12:10（Asia/Shanghai）
> 用途：新会话交接，快速恢复开发上下文。请新会话优先阅读本文件 + `AGENTS.md`。

---

## 1. 项目概览

**Factory Finance（工厂财务管理系统）** —— 面向小型注塑加工工厂的轻量级财务管理系统，替代现有 Excel 账目。

**当前阶段**：**Phase 2 已完成 → `PHASE_2 = READY_FOR_REVIEW`**（Phase 3 未启动）

- Phase 1 基线：`5b98c1260b577abac65a3908058b2e35d8d8309b`
- Phase 2 交付报告：`docs/reviews/PHASE_2_DELIVERY_REPORT.md`
- Repository：https://github.com/didi12121/factory-finance.git

---

## 2. 本机开发环境（重要变更）

本机 **Docker 守护进程不可用**（`com.docker.service` 需管理员权限）。当前使用**便携 MySQL 8.4.0**：

```powershell
# 数据目录与配置（已在 .gitignore 排除）
D:\env\Factory Finance\.local\mysql\mysql-8.4.0-winx64
D:\env\Factory Finance\.local\mysql\my.ini        # port=3307, datadir=.local/mysql/data
D:\env\Factory Finance\.local\mysql\error.log

# 启动（后台）
& '.\.local\mysql\mysql-8.4.0-winx64\bin\mysqld.exe' --defaults-file='D:\env\Factory Finance\.local\mysql\my.ini'

# 账号：factory / app123（root 空密码）；库：factory_finance、factory_finance_test、factory_finance_e2e
```

### 2.1 后端（dev profile，8080）

```powershell
$env:JAVA_HOME = 'C:\Users\陈\.jdks\dragonwell-ex-21.0.10'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:SPRING_PROFILES_ACTIVE = 'dev'
$env:DB_URL = 'jdbc:mysql://127.0.0.1:3307/factory_finance_e2e?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8&allowPublicKeyRetrieval=true'
$env:DB_USERNAME = 'factory'; $env:DB_PASSWORD = 'app123'
$env:ADMIN_INITIAL_PASSWORD = 'admin123'
$env:TEMP = 'D:\env\Factory Finance\.local\tmp'; $env:TMP = $env:TEMP   # 规避 esbuild/临时目录限制
& .\backend\mvnw.cmd -B -f backend\pom.xml spring-boot:run
```

### 2.2 后端测试（无 Docker → 外部 MySQL）

```powershell
# 建议每次先重置独立测试库，避免历史数据破坏「固定编号/合计」类断言
& '.\.local\mysql\mysql-8.4.0-winx64\bin\mysql.exe' -h 127.0.0.1 -P 3307 -u factory -papp123 -e "DROP DATABASE IF EXISTS factory_finance_test; CREATE DATABASE factory_finance_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
$env:DB_URL = 'jdbc:mysql://127.0.0.1:3307/factory_finance_test?...'
& .\backend\mvnw.cmd -B -f backend\pom.xml verify "-Dff.testcontainers=false" "-DargLine=-Djdk.attach.allowAttachSelf=true"
# 结果（2026-11-28）：单测 38 + 集成 46 = 84 全通过
```

> CI（GitHub Actions ubuntu）仍默认使用 Testcontainers `mysql:8.4`，无需上述参数。

### 2.3 前端

```powershell
cd frontend
npm run type-check     # ✅
npm test               # ✅ 453/453
$env:TEMP = 'D:\env\Factory Finance\.local\tmp'; $env:TMP = $env:TEMP
npx playwright test    # ✅ 61/61（需后端 8080 运行且 e2e 库干净）
npx vite build; node scripts/verify-isolation.mjs --mode production --dist dist   # ✅ 0 命中
```

---

## 3. Phase 2 已交付能力（摘要）

| 领域 | 关键实现 |
| --- | --- |
| 请求幂等 | `sys_request_idempotency` + `IdempotencyGuard`；所有创建接口必填 `idempotencyKey`；同键同参返回原单据、同键异参 409、不同键相同内容允许 |
| 应收账款 | `rcv_receivable`（YS 编号）、缺省不产生流水、状态/逾期派生、未来月份拒绝、撤销可追溯且已核销禁止撤销 |
| 回款核销 | `rcv_receipt` + `rcv_receipt_allocation`；同事务（收款单 + 1 条流入 + N 条核销）；全额核销限制；并发 FOR UPDATE 防超额；撤销置 REVERSED + 反向流水 |
| 应付账款 | `mst_supplier` + `pay_payable`（YF）；确认不扣资金；`funded_expense_id` 防重复扣减采购付款 |
| 付款核销 | `pay_payment` + `pay_payment_allocation`（FK）；部分付款/多单核销；撤销恢复 |
| 前端 | 应收/回款页面接入真实 API；新增应付/付款/供应商页面；支出 10 分类 + 工资字段；经营概览应收/应付真实余额 |
| 测试 | 后端 84、前端 453、E2E 61（含 `phase2-acceptance.spec.ts`）；`scripts/verify-financial-invariants.sql` 14 条不变式 0 违反 |

---

## 4. 已知遗留（详见 `docs/BACKLOG.md` §E 与交付报告 §7）

- P1（环境）：Docker 不可用 → `docker compose up` / 容器重启持久化未本机实测（配置已修，CI 侧可验证）。
- P2：付款侧自动分配未实现；应收/应付列表分页在应用层完成。
- P3：视觉候选基线未重出；撤销单号未在列表展示。

---

## 5. 快速恢复清单

1. `git log --oneline -5` 确认 HEAD 为 Phase 2 提交。
2. 启动便携 MySQL（§2）→ 启动后端（§2.1）→ `curl http://127.0.0.1:8080/api/v1/health`。
3. 前端 `npm run dev`（:5173，/api 代理 :8080）；登录 `admin / admin123`（dev）。
4. 需要跑 E2E 前：重置 `factory_finance_e2e` 并**重启后端**（Flyway 在启动时迁移），再 `npx playwright test`。
5. 阅读 `docs/DECISION_LOG.md` 末尾 2026-11-28 的 Phase 2 决策行，避免推翻已确认口径。
