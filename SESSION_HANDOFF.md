# Factory Finance — 开发环境与进度交接记录

> 更新时间：2026-11-28 14:50（Asia/Shanghai）
> 用途：新会话交接。请优先阅读本文件 + `AGENTS.md` + `docs/DECISION_LOG.md` 末尾决策行。

---

## 1. 当前阶段

| 阶段 | 状态 |
| --- | --- |
| Phase 1 | ✅ 真实资金管理主体 |
| Phase 2 | ✅ 正式应收应付与回款/付款核销（审核通过） |
| **MVP 上线准备** | ✅ **READY_FOR_REVIEW**（采购支出关联完整性 / Excel 数据迁移 / 财务核对 / 真实 Compose 部署验证） |
| Phase 3 | ⛔ 未启动（不得擅自开始复式记账等） |

- MVP 交付报告：`docs/reviews/MVP_DELIVERY_REPORT.md`
- Phase 2 交付报告：`docs/reviews/PHASE_2_DELIVERY_REPORT.md`
- 生产部署说明：`docs/DEPLOYMENT.md`

**待架构师确认**：实际用户 Excel 的字段映射、期初日期与历史数据范围（确认前只允许虚构数据验证）。

---

## 2. 本机环境

### 2.1 Docker（本阶段已可用）

- Docker Desktop 29.4.3 / Compose v5.1.3，`com.docker.service` 已可启动（需管理员权限启动一次）。
- **注意端口**：`127.0.0.1:8080` 常被上一次遗留的后端 java 进程占用；
  `Get-Process -Name java | Stop-Process -Force` 后再 `docker compose up -d`。
- Compose 起停：
  ```powershell
  cd 'D:\env\Factory Finance'
  docker compose up -d --build     # 全新启动（.env 需有 ADMIN_INITIAL_PASSWORD）
  docker compose ps               # 三容器 healthy
  docker compose stop             # 释放端口（数据卷保留）
  docker compose down -v          # 彻底清空数据卷（会丢数据）
  ```
- 生产库容器：`factory-finance-mysql`；账号 `factory / <MYSQL_PASSWORD>`；库 `factory_finance`。

### 2.2 便携 MySQL（无 Docker 时用于本地测试）

```powershell
& '.\.local\mysql\mysql-8.4.0-winx64\bin\mysqld.exe' --defaults-file='D:\env\Factory Finance\.local\mysql\my.ini'
# 端口 3307；factory/app123；库 factory_finance(_test/_e2e)
```

### 2.3 后端 / 前端 / 测试

```powershell
# 后端（dev）
$env:JAVA_HOME='C:\Users\陈\.jdks\dragonwell-ex-21.0.10'; $env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:SPRING_PROFILES_ACTIVE='dev'
$env:DB_URL='jdbc:mysql://127.0.0.1:3307/factory_finance_e2e?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8&allowPublicKeyRetrieval=true'
$env:DB_USERNAME='factory'; $env:DB_PASSWORD='app123'; $env:ADMIN_INITIAL_PASSWORD='admin123'
$env:TEMP='D:\env\Factory Finance\.local\tmp'; $env:TMP=$env:TEMP
& .\backend\mvnw.cmd -B -f backend\pom.xml spring-boot:run

# 后端测试（先重置测试库，避免历史数据破坏固定编号类断言）
& '.\.local\mysql\mysql-8.4.0-winx64\bin\mysql.exe' -h 127.0.0.1 -P 3307 -u factory -papp123 -e "DROP DATABASE IF EXISTS factory_finance_test; CREATE DATABASE factory_finance_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
& .\backend\mvnw.cmd -B -f backend\pom.xml verify "-Dff.testcontainers=false" "-DargLine=-Djdk.attach.allowAttachSelf=true"
# 结果：95/95

# 前端
cd frontend; npm run type-check; npm test          # 453/453
$env:TEMP='D:\env\Factory Finance\.local\tmp'; npx playwright test   # 需后端 8080 + 干净 e2e 库
npx vite build; node scripts/verify-isolation.mjs --mode production --dist dist   # 0 命中
```

---

## 3. 本阶段新增能力（速查）

### 3.1 采购支出 ↔ 应付单（V4）

- `pay_payable.funded_expense_key`（STORED 生成列）+ 唯一索引 → 同一支出最多一张有效应付单；撤销自动解除。
- `GET /api/v1/payable/payables/fundable-expenses`：可关联支出候选。
- 撤销守卫：`treasury.api.FundDocumentVoidGuard`（实现在 `payable.application.PurchaseExpenseLinkGuard`）。

### 3.2 Excel 数据迁移（V5 + `importer` 模块）

| 接口 | 说明 |
| --- | --- |
| `GET /api/v1/import/templates` | 8 类模板与列定义 |
| `GET /api/v1/import/templates/{code}/file` | 下载 .xlsx（含填写说明） |
| `POST /api/v1/import/preview` | multipart(templateCode,file)：解析+校验+重复识别，不落库 |
| `POST /api/v1/import/confirm` | multipart：逐行调用业务服务写入；同文件重复确认返回既有批次 |
| `GET /api/v1/import/batches` / `{id}` | 批次记录与逐行结果 |
| `GET /api/v1/import/reconciliation` | 账户/总资金/客户应收/供应商应付/导入统计/差异提示 |

- 模板：CUSTOMER / SUPPLIER / SHAREHOLDER / FUND_ACCOUNT / CONTRIBUTION / EXPENSE / RECEIVABLE / RECEIPT。
- 导入写入端口：`MasterdataWriteApi` / `TreasuryWriteApi` / `ReceivableWriteApi`（禁止直写业务表）。
- 去重：文件级（模板+SHA256 唯一）+ 行级（`imp`+内容哈希幂等键）。
- 前端入口：`/business/import`「数据迁移」。

---

## 4. 已知遗留（详见 `docs/BACKLOG.md` §F）

- 导入模板存在顺序依赖（已在文档说明建议顺序）。
- 导入不支持修改已确认单据/解除关联（走撤销 + 重新登记）。
- 回款导入要求全额核销（与线上规则一致）。
- 视觉候选基线仍为信息模式（非阻塞）。

---

## 5. 快速恢复清单

1. `git log --oneline -5` 确认 HEAD 为 MVP 提交。
2. `docker compose up -d --build`（或按 §2.2 起便携 MySQL + dev 后端）。
3. 浏览器 `http://127.0.0.1:8088`（compose）或 `http://localhost:5173`（dev），登录 `admin` / `ADMIN_INITIAL_PASSWORD`（dev 默认 `admin123`）。
4. 验证导入：导航「数据迁移」→ 下载模板 → 填写 2 行 → 预览 → 确认导入 → 查看批次与核对。
5. 若改动涉及 Flyway：只能新增 `V6__…`，禁止修改 V1–V5。
