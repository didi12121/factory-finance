# Factory Finance — Phase 0.1 Development Task

## 1. 角色与项目背景

你是 Factory Finance 项目的开发 Agent，负责按照已经确定的架构和产品设计规范完成工程实现。

项目架构师负责整体架构、财务规则、数据库设计、开发路线和阶段验收。

你不得未经批准修改核心架构、技术栈、财务规则及 UI 设计语言。

Factory Finance 是一个面向小型注塑加工工厂的轻量级财务管理系统，最终用于替代现有 Excel 账目管理方式。

系统最终需要支持：

- 资金账户及资金流水
- 股东出资、借款、垫资及分红
- 客户与供应商管理
- 加工费对账
- 应收账款及回款核销
- 应付账款及付款核销
- 采购、工资、水电费和其他费用
- 固定资产与折旧
- 自动复式记账
- 资产负债表、利润表、现金流量表
- 工厂经营分析
- 后续 AI 财务助手

核心产品原则：

用户负责录入真实业务，系统负责执行财务规则、生成凭证、计算余额及统计报表。

本次仅允许执行 Phase 0.1。

---

## 2. 当前阶段目标

Phase 0.1 — Foundation, Architecture & Design System

完成以下基础设施：

1. 项目工程骨架。
2. 后端模块化单体基础架构。
3. 前端工程初始化。
4. Docker Compose 本地开发环境。
5. 项目架构及约束文档。
6. Stripe Dashboard Inspired Design System。
7. 公共 UI 组件基础设施。
8. 基础页面布局。
9. 自动化测试及截图测试基础设施。

本阶段不开发真实财务业务，不接入用户的真实 Excel 数据。

如果当前目录已有代码，必须先检查现有项目结构和 Git 状态，不得直接覆盖或删除已有实现。

---

## 3. 强制技术栈

### Backend

- Java 21
- Spring Boot 3.x
- Maven
- MyBatis-Plus
- MySQL 8
- Flyway
- Spring Security
- JWT
- Jakarta Validation
- OpenAPI
- JUnit 5
- Testcontainers

### Frontend

- Vue 3
- TypeScript，开启 strict
- Vite
- Vue Router
- Pinia
- shadcn/vue
- Tailwind CSS
- TanStack Table
- Lucide Icons
- ECharts
- Axios
- Vitest
- Playwright

### Infrastructure

- Docker Compose
- Nginx
- 本地文件存储接口抽象

使用相互兼容的稳定版本，锁定依赖版本并提交 lockfile。

不得引入：

- 微服务架构
- Nacos
- Dubbo
- Redis
- Kafka
- RabbitMQ
- Elasticsearch
- Kubernetes
- 现成的 Admin 后台模板
- 额外的完整 UI 组件库

如果确实存在依赖冲突，应记录具体问题，不得擅自替换核心技术栈。

---

## 4. 项目目录结构

采用 Monorepo 结构：

```text
factory-finance/
├── AGENTS.md
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml
├── docs/
│   ├── ARCHITECTURE.md
│   ├── REQUIREMENTS.md
│   ├── DATABASE_DESIGN.md
│   ├── ACCOUNTING_RULES.md
│   ├── DESIGN_SYSTEM.md
│   ├── UI_GUIDELINES.md
│   ├── API_CONTRACT.md
│   ├── DEVELOPMENT_ROADMAP.md
│   ├── DECISION_LOG.md
│   ├── references/
│   └── reviews/
├── backend/
├── frontend/
├── deploy/
│   └── nginx/
├── scripts/
└── artifacts/
    └── screenshots/
```

允许根据实际构建工具调整必要的工程文件，但必须保持上述职责划分。

所有重要架构决策必须记录到 docs/DECISION_LOG.md。

---

## 5. 后端架构要求

采用 Modular Monolith（模块化单体），优先按照业务领域划分模块，而不是将整个项目简单划分为全局 controller、service、mapper。

建议包结构：

```text
com.factoryfinance
├── bootstrap
├── common
├── infrastructure
├── modules
│   ├── identity
│   ├── masterdata
│   ├── treasury
│   ├── receivable
│   ├── payable
│   ├── expense
│   ├── shareholder
│   ├── fixedasset
│   ├── accounting
│   ├── reporting
│   ├── attachment
│   └── audit
```

单个业务模块根据需要划分为：

```text
module/
├── api
├── application
├── domain
└── infrastructure
```

禁止为了追求形式上的 DDD 而创建大量没有实际用途的空接口和空实现。

本阶段只需要建立基础模块边界、公共基础设施以及可运行的后端工程。未开发模块通过架构文档描述，不需要生成大量虚假业务代码。

### 后端基础设施

实现：

- 全局异常处理
- 统一业务错误码
- 请求参数校验
- 分页响应模型
- Request ID / Trace ID
- 基础日志配置
- OpenAPI 配置
- Actuator Health Check
- Flyway 配置
- MySQL 数据源配置
- 环境配置隔离
- Spring Security 安全基础配置

API 路径统一使用：

```text
/api/v1/...
```

示例成功响应：

```json
{
  "code": "SUCCESS",
  "message": "success",
  "data": {},
  "traceId": "..."
}
```

业务错误应使用适当的 HTTP 状态码，不允许所有请求统一返回 HTTP 200。

本阶段至少提供可验证的健康检查接口。

认证模块可以保留接口设计和基础安全配置，但不要求本阶段完成正式用户、角色、权限以及 JWT 生命周期管理。

不得使用伪造 JWT 或默认放行全部业务接口的方式模拟正式认证。

---

## 6. 财务架构基础约束

本节必须写入 ACCOUNTING_RULES.md，作为后续开发的强制规则。

### 6.1 业务与财务分离

系统必须区分：

- 原始业务单据
- 资金收付款流水
- 应收应付明细
- 核销记录
- 会计凭证
- 会计分录
- 财务报表

营业收入不等于实际收款。

经营费用不等于实际付款。

股东出资不等于营业收入。

股东借款不等于所有者权益。

购买固定资产不一定立即产生等额费用。

账户间转账不产生营业收入及费用。

### 6.2 金额规范

后端金额统一使用 Java BigDecimal。

数据库人民币金额字段采用 DECIMAL(18,2)，单价、成本分摊、折旧中间计算等需要更高精度的字段单独定义。

禁止使用 float 或 double 进行财务金额计算。

前后端财务金额通过十进制字符串传输，禁止依赖 JavaScript Number 进行需要精确结果的财务运算。

舍入方式及舍入时点必须在对应业务规则中明确，禁止无依据地对每个中间结果提前四舍五入。

### 6.3 复式记账

未来会计引擎必须满足：

```text
借方金额合计 = 贷方金额合计
```

每一笔已过账业务应当可以追溯到对应原始单据。

已过账凭证不得直接修改或物理删除。

更正必须通过冲销、更正凭证或明确的撤销流程完成。

业务单据、相关资金变动、核销和会计凭证的记账操作必须具备事务一致性及幂等性。

### 6.4 资金余额

资金余额必须能够通过有效资金流水及期初余额重新计算。

允许后续设计余额缓存，但缓存不允许成为无法核对的独立数据源。

### 6.5 应收账款

未来采用：

```text
receivable
receipt
receipt_allocation
```

核销明细实现收款单与应收单之间的多对多关系。

一笔实际收款只允许记录一次资金流入。

禁止将一笔收款因为核销多个对账单而重复计入资金余额。

预收款、未分配收款、退款、坏账、折扣和冲销必须具有明确的独立业务规则。

### 6.6 编号与审计

内部主键和业务单据编号分离。

业务单据编号一旦正式生成，不得因为排序、删除其他记录或修改日期而改变。

单据编号应具有数据库唯一性约束。

记录业务发生日期、实际收付款日期、会计期间、创建时间、操作人等不同维度。

### 6.7 实施范围

第一版采用：

- 单工厂
- 单账套
- 人民币本位币
- 内部经营财务管理
- 权责发生制

税务处理、制造成本归集、期初余额迁移、会计期间结账等细节留待对应阶段由架构师确认。

不得在本阶段擅自实现未经审核的正式财务规则。

---

## 7. 前端产品设计方向

系统 UI 唯一主要参考为：

**Stripe Dashboard**

参考网站：

- https://stripe.com/
- https://dashboard.stripe.com/

如果无法访问 Stripe Dashboard 登录后的页面，不得尝试绕过认证，不得声称已经查看其实际界面。

使用公开可访问的设计参考，以及本项目的 Design System。

设计定位：

Professional Financial Operations Software

专业、克制、现代、高信息密度、适合长期操作的企业级财务管理系统。

不要求像素级复刻 Stripe，不得使用 Stripe 品牌 Logo 或冒充 Stripe 官方产品。

---

## 8. Design System V1.0

### 8.1 Color Tokens

```css
:root {
  --color-brand: #635bff;
  --color-brand-hover: #5147e5;
  --color-brand-subtle: #eeebff;

  --color-text-primary: #1a1f36;
  --color-text-secondary: #425466;
  --color-text-muted: #697386;

  --color-background: #f7f9fc;
  --color-surface: #ffffff;
  --color-surface-hover: #f7f9fc;
  --color-border: #e3e8ee;

  --color-success: #09825d;
  --color-success-subtle: #e8f5ee;

  --color-warning: #b76e00;
  --color-warning-subtle: #fff4d6;

  --color-danger: #cd3d64;
  --color-danger-subtle: #fce8ef;
}
```

这些 Token 是项目自己的初始设计规范，不是 Stripe 官方完整设计规范。

必须将 Token 映射到 shadcn/vue 和 Tailwind CSS 的主题系统。

业务页面禁止直接散落大量十六进制颜色值。

正文、按钮、状态文字必须通过可访问性对比度检查。对于对比度不足的组合，可定义可访问性专用语义 Token，并记录到设计规范。

### 8.2 Typography

优先使用 Inter + Noto Sans SC，提供合理的系统字体回退。

字体资源必须采用合法分发方式。

不允许应用运行时强制依赖国外字体 CDN。

字体规范：

- 页面标题：24px / 600
- 区域标题：16px / 600
- 正文：14px / 400
- 表格正文：13px / 400
- 辅助文字：12px
- 财务核心数字：28–32px / 600

金额使用：

```css
font-variant-numeric: tabular-nums;
```

财务数字统一千分位、两位小数、右对齐。

### 8.3 Layout Tokens

```text
Sidebar width:       224px
Collapsed sidebar:    56px
Header height:        56px
Page padding:         24px
Section spacing:      24px
Table row height:     44px
Table header height:  40px
Button height:        36px
Input height:         36px
Default radius:        6px
Panel radius:          8px
Base spacing unit:     4px
```

桌面端优先。

移动端侧边栏转换为抽屉。

宽表格允许在表格容器内横向滚动，但不允许整个页面出现非预期横向滚动。

阴影主要用于浮层、弹窗及必要的层级表达。

普通内容区域优先使用细边框、留白和分割线。

---

## 9. UI 强制禁止事项

禁止以下典型 AI Generated UI 风格：

- 装饰性紫蓝渐变
- 玻璃拟态
- 霓虹光效
- 大面积阴影
- 超大圆角
- 所有内容均采用独立卡片
- 营销型标题和欢迎横幅
- 大面积插画作为后台背景
- Emoji 功能图标
- 无意义的图表和动画
- 大量胶囊形按钮
- 为填充空间而生成的数据
- 页面之间不一致的布局
- 通用 AI SaaS Landing Page 风格

品牌主色为紫色，但不允许将整个页面设计为紫色主题背景。

必须主要依靠排版、对齐、边框、间距及信息层级形成专业感。

页面内使用简洁、具体、业务导向的中文文案，避免空洞的 AI 式营销措辞。

---

## 10. 前端目录结构

```text
frontend/src/
├── app/
├── assets/
├── components/
│   ├── ui/
│   ├── shared/
│   ├── finance/
│   └── layout/
├── composables/
├── features/
├── layouts/
├── router/
├── services/
├── stores/
├── styles/
├── types/
├── utils/
└── views/
```

原则：

- shadcn/vue 原子组件放在 components/ui。
- 通用业务无关组件放在 components/shared。
- 财务通用组件放在 components/finance。
- 具体业务页面按 feature 组织。
- 统一管理 API 请求。
- 不允许在各页面重复实现格式化、请求拦截、金额处理等公共逻辑。
- 不允许引入 any 来绕过核心类型检查。

---

## 11. Application Shell

本阶段完成可运行的基础应用布局。

### Sidebar

导航规划：

```text
工厂财务

工作台
  经营概览

资金管理
  资金账户
  资金流水

业务管理
  应收账款
  应付账款
  加工费回款
  费用管理
  工资管理
  股东往来
  固定资产

财务核算
  会计凭证
  财务报表

基础资料
  客户管理
  供应商管理

系统
  系统设置
```

要求：

- 使用 Lucide 图标。
- 支持侧边栏折叠。
- 支持当前路由高亮。
- 使用克制的选中背景。
- 导航分组清晰。
- 未开发功能应明确标记为尚未实现，不得制造已经可以使用的假象。
- 不允许出现无响应的假按钮。

### Header

包含基础页面导航和用户区域。

搜索、通知等尚未实现的功能不需要放置假交互入口。

### Content

统一内容宽度、内边距和页面标题位置。

本阶段允许使用基础占位页面，不开发正式经营首页及应收账款业务页面。

### Responsive Layout

至少支持：

- 1920×1080
- 1440×900
- 1280×800
- 390×844

---

## 12. 公共组件

基于 shadcn/vue 建立并验证以下基础组件：

### UI Components

- Button
- Input
- Select
- Checkbox
- Dialog
- Sheet
- DropdownMenu
- Tabs
- Tooltip
- Table
- Skeleton
- Separator
- Badge
- Toast

### Shared Components

- PageHeader
- PageToolbar
- DataTable
- TablePagination
- SearchInput
- FilterBar
- EmptyState
- ErrorState
- LoadingState
- ConfirmDialog
- DetailSheet
- FormField

### Finance Components

- MoneyText
- AmountInput
- DocumentNumber
- FinancialStatus
- FinancialMetric

禁止为了封装而过度封装。

DataTable 应具备基本的列定义、排序、分页、空数据、加载状态，并预留服务端分页能力。

MoneyText 应当正确处理：

```text
0.00
1,850.39
-1,850.39
1,000,000.00
```

AmountInput 应验证金额格式及精度，不允许科学计数法或隐式浮点舍入造成金额错误。

FinancialStatus 应使用文字及语义色表达状态，不能只通过颜色区分。

---

## 13. Design System Showcase

创建独立的开发环境组件展示页面：

```text
/dev/design-system
```

用于展示：

- Color Tokens
- Typography
- Buttons
- Inputs
- Select
- Tabs
- DataTable
- Dialog
- DetailSheet
- FinancialMetric
- MoneyText
- FinancialStatus
- EmptyState
- LoadingState
- ErrorState

展示页面可以使用明确标记的虚构测试数据，不得使用真实客户姓名、真实工厂账目或其他私人数据。

此页面必须仅在开发或明确启用的测试环境可用。

本阶段组件设计必须尽量接近 Stripe Dashboard 的专业财务软件风格。

---

## 14. Docker Compose

建立本地开发环境，支持：

- MySQL
- Spring Boot Backend
- Vue Frontend / Nginx

根据实际开发模式合理组织容器，支持本地直接运行前后端及 Docker Compose 启动。

要求：

- MySQL 使用持久化数据卷。
- 配置健康检查。
- 提供 .env.example。
- 不提交真实密码和 Secret。
- 不允许将生产数据库密码硬编码到代码。
- 数据库默认不暴露到公网。
- Nginx 正确代理 /api。
- 前端支持 SPA 路由刷新。
- README 提供完整运行步骤。
- 不允许应用启动时自动删除数据库或执行破坏性初始化。

本阶段 Flyway 只建立迁移机制和必要的已确认基础设施，不创建未经审核的完整财务数据库表。

---

## 15. 自动化测试要求

### Backend

至少覆盖：

- Spring Boot Context 启动
- Health Check
- 参数校验
- 统一异常响应
- 基础安全策略
- Flyway 迁移及 MySQL 连接验证

### Frontend

至少覆盖：

- 金额格式化
- 金额输入精度校验
- 公共组件基本行为
- 路由及布局
- Design System Showcase 页面

### Playwright

必须启动实际应用，使用浏览器进行验证。

至少覆盖：

- 页面正常加载
- Sidebar 折叠与展开
- 导航行为
- Dialog 打开和关闭
- DetailSheet 打开和关闭
- DataTable 排序及分页
- 金额组件显示
- 键盘基本可访问性
- 移动端布局
- 页面无非预期横向溢出

必须生成以下实际浏览器截图：

```text
artifacts/screenshots/phase-0.1/
├── shell-1920x1080.png
├── shell-1440x900.png
├── shell-1280x800.png
├── shell-mobile-390x844.png
├── design-system.png
├── data-table.png
├── dialog.png
└── detail-sheet.png
```

截图必须来自真实运行的应用，不得使用生成式图片、手工绘制效果图或静态设计稿冒充。

如果当前 Agent 无法查看图片，可以生成截图并交由架构师审核，不得声称已经完成视觉检查。

视觉回归基线须在人工审核通过后再正式固化。

---

## 16. 项目文档要求

AGENTS.md 必须明确：

- 项目目标
- 强制技术栈
- 架构约束
- 财务数据处理约束
- UI 设计规范引用
- 代码风格
- 测试要求
- 阶段停止条件
- 禁止跨阶段开发

ARCHITECTURE.md 必须描述：

- 模块化单体架构
- 模块边界
- 模块依赖关系
- 事务边界
- 数据流
- 业务单据与财务总账的关系

DATABASE_DESIGN.md 本阶段只定义核心实体、关系、数据类型、约束原则及待确认事项，不得将草案描述为已经验收的最终数据库设计。

ACCOUNTING_RULES.md 必须记录已经明确的财务规则，以及尚未确定的会计处理事项。

DESIGN_SYSTEM.md 必须与实际前端 Token 和组件保持一致。

UI_GUIDELINES.md 必须包含强制设计规范、禁止事项、交互规范和验收标准。

DEVELOPMENT_ROADMAP.md 必须保留以下阶段：

```text
Phase 0.1 — Foundation & Design System
Phase 0.2 — Core UI Prototypes
Phase 0.3 — UI Review & Visual Baseline
Phase 1   — Treasury & Basic Operations
Phase 2   — Receivable & Payable
Phase 3   — Accounting Engine
Phase 4   — Assets & Financial Reporting
Phase 5   — Factory Business Analytics
Phase 6   — AI Finance Assistant
```

在 Phase 1 和 Phase 2 实现的真实财务业务必须遵循已经确认的会计架构，避免产生无法在 Phase 3 完整核算的历史数据。

---

## 17. 本阶段明确禁止开发

- 真实加工费对账业务
- 真实回款及核销业务
- 工资计算
- 费用记账
- 股东出资业务
- 自动会计凭证引擎
- 固定资产折旧
- 财务报表计算
- Excel 历史数据导入
- AI 财务助手
- OCR
- 多租户
- 复杂工作流审批
- 完整生产环境认证体系

不得因为开发顺利而主动进入 Phase 0.2。

---

## 18. 验收标准

只有满足以下条件，才能申请 Phase 0.1 验收：

- 前端可以正常构建及启动。
- 后端可以正常构建及启动。
- MySQL 和 Flyway 可以正常工作。
- Docker Compose 开发环境可运行。
- 架构文档齐全。
- Design Tokens 已实际使用。
- Application Shell 可正常交互。
- 公共组件具备可验证行为。
- Design System Showcase 可访问。
- 自动化测试完成。
- 实际浏览器截图已生成。
- 没有真实财务业务越界实现。
- 没有硬编码 Secret。
- 没有未经批准的架构和技术栈变更。

测试环境不具备某项能力时，必须记录 BLOCKED，不得伪造通过结果。

---

## 19. 最终交付报告

完成后输出结构化报告：

```text
# Phase 0.1 Delivery Report

## 1. Status
READY_FOR_REVIEW / BLOCKED

## 2. Implemented
已完成内容

## 3. Architecture
实际架构和模块结构

## 4. Dependency Versions
实际锁定版本

## 5. Design System
Token、组件、布局实现情况

## 6. Test Results
实际执行的测试命令
通过数量
失败数量
跳过数量

## 7. Screenshots
截图文件路径

## 8. Run Instructions
实际启动命令
访问地址

## 9. Architecture Decisions
新增决策及理由

## 10. Known Issues
已知问题、未完成项及阻塞

## 11. Git
提交 Hash
工作区状态

## 12. Scope Verification
Phase 0.2 started = NO
Real financial business implemented = NO
Real financial data imported = NO
```

如果存在未完成项，不得输出虚假的 COMPLETE。

完成后停止开发，等待架构师与产品负责人审核。

# STOP CONDITION

PHASE_0_1 = READY_FOR_REVIEW

PHASE_0_2_STARTED = NO

未经明确批准，不得进入下一阶段。