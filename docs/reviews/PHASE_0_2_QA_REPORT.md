# Phase 0.2 独立质量审核报告（Agent H / P02-H）

> 审核人：Independent QA Engineer / Architecture Reviewer（Agent H）
> 审核时间：2026-11-27（Asia/Shanghai）
> 审核对象：Phase 0.2 前端原型集成分支（D 经营概览 / E 资金流水 / F 应收账款 / G 回款核销）
> 证据原则：全部结论来自真实执行（真实浏览器、真实命令输出、真实产物扫描）；截图证据位于 `frontend/test-results/qa/`（审核证据，非最终交付截图）。

---

```yaml
reviewed_commit:
  branch: phase-0.2/agent-h-review
  head: c0838f2c03be254dcdfce868087d21ff98103e6a
  head_subject: "fix(integration): restore payables route, adapt shared e2e specs to prototype reality"
  note: >-
    任务描述基线为 674136e（phase-0.2/integration HEAD）。实测 674136e 不是本分支祖先，
    本分支基于 c0838f2；两者差异仅 8 个 artifacts/screenshots/phase-0.1.1/*.png 二进制截图
    （git diff --stat HEAD phase-0.2/integration -- . ':!artifacts' 为空），
    被审代码与 674136e 完全一致。生产代码零改动（git status 仅新增 QA 交付物）。

architecture_review:
  module_boundaries: PASS
  evidence:
    file_ownership: >-
      git log 340acb8..HEAD --name-only 逐提交核对：Agent D 仅 features/dashboard/** + e2e/dashboard.spec.ts；
      Agent E 仅 features/treasury/** + e2e/transactions.spec.ts；Agent F 仅 features/receivables/** + e2e/receivables.spec.ts；
      Agent G 仅 features/receipts/** + e2e/receipts.spec.ts。共享文件改动仅集成侧提交
      （7f268a0 FinancialMetric/MoneyText、a263eb1 路由/DemoModeBanner/config、c0838f2 路由 + 共享 e2e 适配），
      开发 Agent 未越界；各 feature 目录互不引用（grep 'features/(dashboard|treasury|receivables|receipts)' 无跨 feature import）。
    shared_types: >-
      四页面全部使用冻结契约类型（@/features/prototype/contracts/*），无本地重复实体定义；
      页面层仅引用 domain 纯函数（sumAmounts/compareAmounts/compareReceivableUrgency 等），未复制统计/金额公式。
    mock_store_uniqueness: PASS_WITH_NOTE
    mock_store_note: >-
      grep defineStore 共 2 处：features/prototype/stores/prototype.ts（唯一业务 Mock Store，单一数据源）与
      stores/app.ts（纯 UI 状态：侧边栏折叠/移动导航抽屉，不含任何业务/演示数据）。
      业务数据 Store 唯一性成立；app store 属 UI 壳状态，非业务数据副本。
    duplicate_business_logic: PASS_WITH_NOTE
    duplicate_note: >-
      财务公式无复制（应收派生仅 domain/receivable.ts、看板统计仅 domain/reporting.ts、
      核销规则仅 domain/allocation.ts、余额重算仅 domain/treasury.ts）。
      一处展示层重复：TRANSACTION_TYPE_LABELS 在 dashboard/chartData.ts 与 treasury/transactionsModel.ts
      双份维护且文案不一致（见 F-002）。
    shared_components: PASS
    shared_components_note: >-
      DataTable/MoneyText/FinancialMetric/FinancialStatus/DocumentNumber/DetailSheet/FilterBar/
      SearchInput/EmptyState/ErrorState/LoadingState/ConfirmDialog/AmountInput 全部复用共享层，
      无页面内重复实现；hex 色值仅存在于 DesignSystemView 的 Token 展示表（业务页面 0 处散落色值）。
    tech_stack_changes: PASS
    tech_stack_note: package.json 与锁定版本一致，Phase 0.2 无新增依赖（jsdom 30.1.3 已记录 DECISION_LOG 2026-11-27）。
    phase_scope: PASS
    phase_scope_note: >-
      无正式后端业务（services/http 仅 Phase 0.1 health 使用，原型层零网络请求、零持久化）；
      全部数据为明确标记的虚构 fixtures（features/prototype/data/fixtures.ts）；未实现入口无假按钮
      （NewRecordMenu 仅含已实现的回款登记；侧边栏未实现分组带「未实现」Badge；占位页明确标注 Phase）。
    build_isolation_code_review: >-
      router/index.ts 以 prototypeView() 构建期隔离加载四个演示业务页（import.meta.env.DEV /
      VITE_ENABLE_PROTOTYPE 静态折叠，Rollup 消除 fixtures/Mock Store chunk）；
      /dev/design-system 由 DESIGN_SYSTEM_ENABLED 路由守卫保护，但其动态导入未做构建期隔离（见 F-001）。

financial_review:
  overall: PASS
  decimal_precision: PASS
  decimal_note: >-
    金额全程 DecimalString + utils/decimal.ts BigInt 定点（add/subtract/multiply/compare/round 全 BigInt）；
    grep parseFloat|Number(|Math.round 财务路径命中 0；例外均非财务运算并逐一确认：
    chartData.ts toChartNumber = Number(value) 仅用于 ECharts series 几何值（tooltip/指标一律 formatAmount 字符串，注释与实现一致，符合"图表边界除外"豁免）；
    dashboard/period.ts Number() 为日期解析；TablePagination Number() 为页大小；测试与 DesignSystemView 为计数/展示生成。
  derived_balances: PASS
  derived_note: >-
    应收余额 = 原始 − 有效核销（domain/receivable.ts，欠款钳制 ≥ 0，负差归零）；
    回款状态（UNPAID/PARTIALLY_PAID/SETTLED）与逾期 isOverdue 为独立派生属性（dueDate 为 null 恒不逾期、到期日当天不判逾期）。
  allocation_constraints: PASS
  allocation_note: >-
    domain/allocation.ts checkAllocationPlan：核销金额 > 0（格式严格 DECIMAL(18,2)）、核销总额 ≤ 实际收款、
    单张累计核销 ≤ 原始应收、跨客户拒绝、重复分配项拒绝、已结清/不存在应收单拒绝、
    账户存在且启用、未分配 > 0 禁止确认（预收款留待 Phase 2）；Store 层为最终防线。
  receipt_vs_allocation_separation: PASS
  receipt_vs_allocation_note: >-
    收款单实际总额（Receipt.actualAmount）与本单核销金额（ReceiptAllocation.allocationAmount）
    在 receivableDetail.ts 严格区分并在详情页分两列展示；e2e S1 对 ar-001/ar-002 断言
    15,000.00/8,000.00 与 15,000.00/7,000.00，且详情页已收金额不含收款单总额（红线断言 not.toContainText）。
  single_cash_inflow: PASS
  single_cash_inflow_note: confirmReceipt 原子生成 收款单×1 + 资金流入流水×1 + 核销明细×N；核销不产生新流水（e2e S1/S5 验证 22→23 条）。
  income_vs_cash: PASS
  income_vs_cash_note: >-
    期间加工收入（权责，按 accountingMonth）与期间实际回款（资金，按 receiptDate）分离；
    e2e S1 断言回款 15,000.00 后加工收入 99,278.32 不变（变化 0.00）；股东出资（SHAREHOLDER_CONTRIBUTION）不计收入（reporting.test 断言）。
  internal_transfer: PASS
  internal_transfer_note: >-
    内部转账成对流水（OUT+IN 同额同 transferGroupId）；整体口径排除内部转账（净零、不计收付趋势与支出分类）；
    e2e S6 断言 4 条成对流水、汇总 0 条计入（流入/流出/净流入均 0.00）、关联流水 FT-2026-0005↔FT-2026-0006、
    期间实际支出 43,150.50 不含转账（误计应为 53,150.50）。
  idempotency: PASS
  idempotency_note: >-
    idempotency.ts FNV-1a 64 位参数哈希（BigInt）；同键同参返回原收款单、同键异参 CONFLICT 拒绝；
    e2e S5 双击确认仅一张收款单/一条流水/核销不重复（ar-002 未收 5,000.00 未被重复扣减）。
  failure_zero_change: PASS
  failure_zero_change_note: >-
    confirmReceipt 先全量校验后一次性提交；e2e S4 对超额/累计超原额/非法金额/未分配/金额 0 五类失败
    做失败前后逐字段快照比对（看板 5 指标、收款单数、流水数、应收行金额/状态全部一致）。
  balance_recomputable: PASS
  balance_recomputable_note: 账户余额不缓存（recomputeAccountBalance = 期初 + 有效 IN − 有效 OUT，VOIDED 不参与），e2e 与单测双重验证。
  demo_today_discipline: PASS
  demo_today_note: 账龄/逾期/趋势/审计时间全部以 DEMO_TODAY='2026-11-30' 为基准（dateRules/period UTC 日历），无真实时间参与派生计算。

production_isolation:
  verdict: FAIL
  detail:
    build: "npm run build 通过（exit 0，3549 modules，6.35s）"
    fixtures_eliminated: >-
      prototype fixtures/Mock Store/四个演示业务页 chunk 全部被 Rollup 消除：
      'DEMO_TODAY'、'2026-11-30'、'AR-2026-0024'、'SK-2026-0008'、'FT-2026-0022'、'demo-rc-001'、
      '示例供应商甲'、'示例股东甲'、'虚构演示数据'、'跨模块演示场景' 在 dist 0 命中（node 扫描 4 文件/748,093 字节）。
    leak: >-
      1 处命中：'示例客户 A' @ dist/assets/DesignSystemView-CeOeVTkr.js（150.86 kB / gzip 43.48 kB）——
      /dev/design-system 展示页模块（含动态生成的'示例客户 B–H'、'虚构测试数据'标记、'XS-2026-0001 · 示例客户 A · 2026-11-02'）
      未做 prototypeView 式构建期隔离，独立 chunk 进入生产产物。按任务判定标准（dist 不含'示例客户'等演示特征字符串）判 FAIL，见 F-001。
    route_behavior: PASS
    route_behavior_note: >-
      npm run test:e2e:prod 1/1 通过（prod-guard.spec.ts：/dev/design-system 重定向 /workbench 且无 Color Tokens）；
      独立验证（临时 Playwright 脚本 test-results/qa/prod-route-check.mjs，非提交物）：
      /dev/design-system、/treasury/transactions、/business/receivables、/business/receivables/ar-001、
      /business/processing-fee 五路由 5/5 重定向 /workbench，页面无演示内容（登记回款/示例客户 A/DEMO_TODAY 零泄漏），
      模拟操作入口全部不可达。prod 配置 testMatch 仅 prod-guard.spec.ts，故演示路由以该独立脚本验证并留档。
    scan_method: >-
      dist 产物扫描与演示路由验证均为临时 node 脚本（frontend/test-results/qa/scan-dist.mjs、prod-route-check.mjs，
      随 test-results/ 不入版本库），脚本全文与输出记录于本报告 production_isolation 一节，可复现。

tests_executed:
  - cmd: npm ci
    result: PASS
    detail: "added 225 packages in 11s（EBADENGINE 警告：Node 24.14.0 vs engines ^22.22.2 || >=24.15.0；DECISION_LOG 2026-11-27 已记录为已知警告，jsdom 系同源，测试全绿）"
  - cmd: npm run type-check
    result: PASS
    detail: "vue-tsc --noEmit ×2（tsconfig.json + tsconfig.node.json）exit 0"
  - cmd: npm test
    result: PASS
    detail: "Vitest 28 files / 298 tests 全部通过（15.88s）"
  - cmd: "$env:E2E_PORT='4189'; npx playwright test e2e/qa-cross-page.spec.ts"
    result: PASS
    detail: "9/9 通过（33.0s）；含 S1 强制跨页面场景（同一会话断言以 window.__QA_SAME_SESSION__ 标记证明无刷新）"
  - cmd: "$env:E2E_PORT='4190'; npx playwright test"
    result: PASS
    detail: "94/94 通过（1.4m）：dashboard 7 + data-table 7 + design-system 9 + keyboard 4 + qa-cross-page 9 + receipts 11 + receivables 17 + screenshots 8 + shell 4 + transactions 16 + mobile 2；既有共享 spec 无问题（c0838f2 对 keyboard/shell 的适配经 diff 审核为增强非削弱）"
  - cmd: npm run test:e2e:prod
    result: PASS
    detail: "1/1 通过（16.2s）：/dev/design-system 生产构建下守卫重定向"
  - cmd: npm run build
    result: PASS
    detail: "exit 0；产物 4 个文本文件/748,093 字节；扫描见 production_isolation"

test_results:
  cross_page_mandatory_S1: PASS
  cross_page_mandatory_S1_detail: >-
    同一浏览器会话（无刷新，SPA 侧边栏导航 + 会话标记为证）完成：回款页登记 15,000.00、
    手动核销 ar-001=8,000.00 + ar-002=7,000.00、确认后依次断言——
    收款单列表 +1（SK-2026-0009 / 15,000.00 / 已核销 15,000.00 / 未分配 0.00 / 共 9 条）；
    应收账款（AR-2026-0001 已结清 已收 8,000.00 未收 0.00；AR-2026-0002 部分回款 已收 7,000.00 未收 5,000.00）；
    应收单 A 详情（收款单实际总额 15,000.00 / 本单核销 8,000.00）；
    应收单 B 详情（收款单实际总额 15,000.00 / 本单核销 7,000.00）；
    资金流水（22→23 条，FT-2026-0023 IN 15,000.00 收款单 SK-2026-0009；流入方向 11→12 条）；
    经营概览（资金余额 77,661.45→92,661.45 = +15,000.00；应收余额 402,567.87→387,567.87 = −15,000.00；
    期间加工收入 99,278.32 不变 = 变化 0.00）。全部金额与独立单测 dashboard-summary.test.ts 基线互相印证。
  S2_create_receivable: PASS
  S2_detail: "创建应收 10,000.00（2026-11）：应收余额 402,567.87→412,567.87（+10,000）、期间加工收入 99,278.32→109,278.32（+10,000）、资金余额 77,661.45 不变、收款单 8 条/流水 22 条不变；列表 AR-2026-0025 +1"
  S3_two_receipts_one_receivable: PASS
  S3_detail: "ar-002 两次回款 3,000.00 + 2,000.00：累计已收 5,000.00、剩余 7,000.00、部分回款；详情两行（SK-2026-0009 3,000.00/3,000.00、SK-2026-0010 2,000.00/2,000.00）；流水 22→24 条"
  S4_invalid_allocation_zero_change: PASS
  S4_detail: >-
    超额核销/累计超原额/非法金额 1.234/未分配 7,000.00/金额 0 五类失败均被拒（错误提示 + 确认禁用），
    失败前后财务数据逐字段一致（看板 5 指标、收款单 8 条、流水 22 条、ar-001/ar-002 行金额状态）；
    跨客户核销在 UI 层被拒（路由预填提示「不属于所选客户」、他客户应收单不进入核销表）；
    无效账户不可构造（账户下拉仅启用账户，示例停用账户 0 选项）；重复分配不可构造（每张应收单唯一输入框），
    此两类的拒绝由 Store/Domain 兜底（allocation.test.ts / store.test.ts / receipts-guard.test.ts，见测试真实性）。
  S5_idempotent_confirm: PASS
  S5_detail: "确认按钮双击：收款单 8→9 张（仅一张 SK-2026-0009）、流水 22→23 条（FT-2026-0023 唯一命中）、ar-001 已收 8,000.00/ar-002 未收 5,000.00 未重复扣减"
  S6_internal_transfer: PASS
  S6_detail: "内部转账筛选 4 条（2 组成对流水）、整体口径 0 条计入（流入/流出/净流入 0.00、口径文案含「已排除内部转账」）、FT-2026-0005 详情关联 FT-2026-0006（流入 IN、同额 2,000.00、tg-002）、加工收入 99,278.32 与支出 43,150.50 不含转账、资金余额净零"
  S7_production_build: FAIL
  S7_detail: "行为层 PASS（演示页面/模拟操作不可用，5/5 路由重定向 + prod-guard 1/1）；产物层 FAIL（DesignSystemView 演示展示 chunk 含 '示例客户 A' 特征字符串，见 F-001）"

test_authenticity_check: PASS
test_authenticity_detail: >-
  抽查全部测试套断言真实性：单测断言行数/金额/状态变化（receipts-flow.test.ts 断言 store.receipts/fundTransactions/
  receiptAllocations 长度与 '15000.00'、SETTLED 等具体值；dashboard-summary.test.ts 断言 '77661.45'/'99278.32'/
  '37246.01'/'43150.50' 等派生金额；ReceivablesView.test.ts 断言行数 24/15/3/6、指标 449,614.38→450,848.94 及
  store 各集合计数不变）；e2e 断言行数（共 N 条）、单元格金额（td nth 精确值）、状态文本、aria-sort 与 computed style。
  未发现「只断言输入框内容」式假测试；receipts-flow 的自动分配用例虽断言输入框值，但同时断言汇总与 store 状态，非假测试。

ui_review:
  verdict: PASS_WITH_NOTES
  evidence: "真实浏览器截图 11 张（frontend/test-results/qa/ui-*.png，1920×1080 桌面 6 张 + 390×844 移动 4 张 + 弹窗 1 张）逐一目检"
  checks:
    stripe_style_consistency: PASS（白面板/细边框/克制紫色主操作/高信息密度/无渐变玻璃拟态霓虹大圆角假卡片营销横幅 emoji 图标）
    information_hierarchy: PASS（页面标题 24px/区域 16px/表格 13px/指标 28px 层级清晰；业务文案具体如「资金结余 · 非净利润」「权责发生制 · 按会计期间」）
    table_typography: PASS（行高 44px/表头 40px/金额列右对齐 + tabular-nums + 千分位两位小数；— 空值语义统一）
    status_colors: PASS（状态一律文字 + 语义色 Badge；回款状态与逾期标识独立两列；流入/流出带正负号与文字标签，非仅颜色）
    amount_alignment: PASS_WITH_NOTE（表格金额右对齐合规；28px 指标数字为左基线对齐，与 DESIGN_SYSTEM §4「指标卡数字右对齐」不一致，见 F-003；28px 字号由 e2e computed style 断言通过）
    date_picker: PASS_WITH_NOTE（原生 date 控件键盘可用、YYYY-MM-DD 值语义正确；显示受浏览器 locale 影响为 mm/dd/yyyy，见 F-008）
    primary_actions: PASS（登记回款/自动分配/清空分配/确认收款/新建应收单全部真实可用，无假按钮；确认弹窗信息完整含「同事务提交」语义说明）
    detail_layout: PASS（应收单详情四段式：摘要指标/基本信息/回款记录（总额 vs 本单核销双列）/核销明细 + 操作历史）
    allocation_efficiency: PASS（自动分配一键按到期日优先 + 逐单手动 + 实时汇总 + 逐单当前未收参照）
    empty_error_states: PASS（EmptyState/ErrorState/金额格式错误/未分配 Phase 2 提示/禁止确认禁用态）
    keyboard_accessibility: PASS（keyboard.spec 4/4：Tab 焦点/Dialog 焦点进入 + ESC/可访问名称/键盘触发排序 aria-sort）
    mobile_390: PASS_WITH_NOTE（抽屉导航、核销卡片布局 390px 可完成登记、指标堆叠；宽表格列逐字竖排可读性差，见 F-007）
    horizontal_overflow: PASS（1920/1440/1280/390 四断点 e2e 断言无页面级横向溢出）
  visual_findings: [F-003, F-004, F-005, F-006, F-007, F-008]
  screenshot_artifact_note: "fullPage 截图中 sticky 页头出现于页面中部为截图拼接伪影，非 UI 缺陷"

findings:
  - id: F-001
    severity: P1
    file: frontend/src/router/index.ts（及 frontend/src/features/dev/design-system/DesignSystemView.vue）
    title: 生产构建产物包含 Design System 演示展示 chunk（演示数据特征字符串泄漏进 dist）
    reproduction: |
      cd frontend; npm run build
      node -e "const t=require('fs').readFileSync('dist/assets/DesignSystemView-CeOeVTkr.js','utf8');console.log(t.includes('示例客户 A'))"
      # 或运行报告同款扫描：node test-results/qa/scan-dist.mjs → forbidden hits=1
    expected: "dist 不含演示 Fixtures/演示数据特征字符串（如 '示例客户'、'DEMO_TODAY' 值）——任务生产构建隔离判定标准"
    actual: >-
      dist/assets/DesignSystemView-CeOeVTkr.js（150.86 kB）包含 '示例客户 A'、动态生成 '示例客户 B–H'、
      '虚构测试数据' 标记与 'XS-2026-0001 · 示例客户 A · 2026-11-02' 展示行；根因：/dev/design-system 的
      动态导入未像四个演示业务页那样经 prototypeView() 构建期隔离，Rollup 无法消除该 chunk。
      行为层不受影响（路由守卫已验证 5/5 重定向、页面不可用），但产物内容违反隔离判定。
    recommended_fix: >-
      将 DesignSystemView 的动态导入移入与 prototypeView 相同的构建期隔离分支
      （静态条件 import.meta.env.DEV || import.meta.env.VITE_ENABLE_DESIGN_SYSTEM === 'true'，
      使 Rollup 在生产构建消除该 chunk），或将整个 dev 路由表项挂在静态可达性守卫之后；
      修复后重跑 npm run build + 产物扫描（0 命中）+ npm run test:e2e:prod 回归。
      分配建议：主 Agent → 集成/路由所有者（router/navigation/styles/docs 归属主 Agent，或指定 D–G 之一）。
  - id: F-002
    severity: P2
    file: frontend/src/features/dashboard/chartData.ts:31 与 frontend/src/features/treasury/transactionsModel.ts:139
    title: TRANSACTION_TYPE_LABELS 展示标签双份维护且文案不一致
    reproduction: "对比两文件常量：dashboard 为 '加工费收款'/'工资'/'水电费'/'采购'，treasury 为 '加工费回款'/'工资支出'/'水电费支出'/'采购支出'"
    expected: "公共展示元数据单一来源（AGENTS.md 公共逻辑禁止重复实现）；同一业务类型跨页面名称一致"
    actual: "同一 TransactionType 在经营概览图表与资金流水表显示不同名称（如加工费收款 vs 加工费回款），双份映射需同步维护"
    recommended_fix: "将 TransactionType 展示名上收到 contracts 或共享展示常量（图表短标签可显式声明别名），两处 import 同一来源"
  - id: F-003
    severity: P3
    file: frontend/src/components/finance/FinancialMetric.vue:19
    title: 指标数字左对齐与 DESIGN_SYSTEM.md §4「右对齐（表格列与指标卡数字）」不一致
    reproduction: "打开经营概览，观察 28px 指标数字左对齐（截图 ui-dashboard-1920.png）；对照 docs/DESIGN_SYSTEM.md §4 第 2 条"
    expected: "实现与冻结设计规范一致；变更须记录 DECISION_LOG 并更新文档"
    actual: "实现为有意的 label/amount 左基线对齐（提交 7f268a0），但 DESIGN_SYSTEM.md 未同步更新、DECISION_LOG 无对应条目"
    recommended_fix: "二选一对齐：更新 DESIGN_SYSTEM.md §4 允许指标卡左对齐并补记 DECISION_LOG，或恢复右对齐"
  - id: F-004
    severity: P3
    file: frontend/src/features/dashboard/chartData.ts:107（buildTrendOption legend）
    title: 收付款趋势图图例与 X 轴/柱条区域重叠
    reproduction: "打开经营概览 1920 与 390 截图，趋势图底部「流入/流出」图例与 X 轴日期标签/柱条重叠"
    expected: "图例与绘图区/轴标签互不遮挡"
    actual: "图例渲染在图表底部绘图区内，与 11-12/11-15 等轴标签及柱条重叠"
    recommended_fix: "显式设置 legend.top（grid.top 预留）或 legend.bottom + 增大 grid.bottom"
  - id: F-005
    severity: P3
    file: frontend/src/features/dashboard/chartData.ts:195（buildExpenseOption xAxis）
    title: 支出分类图 X 轴金额刻度在 390px 视口互相重叠
    reproduction: "390×844 打开经营概览（截图 ui-dashboard-390.png），支出分类图 X 轴 0/5,000/10,000/15,000…标签挤压重叠"
    expected: "窄视口下刻度标签不重叠"
    actual: "刻度标签互相覆盖不可读"
    recommended_fix: "移动端减少刻度数（axisLabel.interval 或 maxInterval）或刻度值缩写（5k/10k）"
  - id: F-006
    severity: P3
    file: frontend/src/features/receipts/ReceiptListSection.vue:223（筛选区收款日期标签）
    title: 收款单筛选区「收款日期」标签列宽不足导致文字逐字竖排
    reproduction: "打开加工费回款页，收款单筛选行日期输入左侧「收款日期」四字竖排（截图 ui-receipt-registration-1920.png）"
    expected: "筛选标签横排完整显示"
    actual: "标签被压缩为逐字竖排（收款/日/期）"
    recommended_fix: "标签 white-space:nowrap 或调整 FilterBar 该项布局（如 '交易日期' 在资金流水页的横排样式）"
  - id: F-007
    severity: P3
    file: frontend/src/features/receipts/ReceiptListSection.vue / frontend/src/features/receivables/ReceivablesView.vue（DataTable 列）
    title: 移动端 390px 宽表格列无最小宽度，编号/客户/账户列逐字竖排
    reproduction: "390×844 打开加工费回款/应收账款（截图 ui-receipt-registration-390.png / ui-receivables-390.png），表格列文字逐字断行"
    expected: "容器内横向滚动时列保持可读宽度（UI_GUIDELINES 允许表格容器内滚动）"
    actual: "列被压缩到最小内容宽度，'示例银行账户'等逐字竖排，可读性差（无页面级溢出，合规但体验差）"
    recommended_fix: "为关键列设 min-width（如编号/客户 ≥ 96px）随容器滚动，或移动端改卡片式列表（登记表单已有卡片布局可参考）"
  - id: F-008
    severity: P3
    file: frontend/src/features/receipts/DateField.vue（原生 date 控件）
    title: 日期控件显示格式随浏览器 locale 为 mm/dd/yyyy，与业务 YYYY-MM-DD 展示规范不一致
    reproduction: "打开登记回款表单，收款日期控件显示 11/30/2026（en-US locale）"
    expected: "业务日期展示与 YYYY-MM-DD 语义一致或有明确格式标注"
    actual: "控件值语义正确（YYYY-MM-DD），但可见文本为 locale 格式"
    recommended_fix: "低优先：格式提示文案或自定义日期控件；保持现生控件亦可接受（键盘可访问性已验证）"

summary_counts:
  total_findings: 8
  P0: 0
  P1: 1
  P2: 1
  P3: 6

overall_status:
  P02_H: NOT_VERIFIED
  INDEPENDENT_QA: FAIL
  open_P0: 0
  open_P1: 1
  reason: >-
    财务规则、跨页面一致性、幂等/零变化、测试真实性全部通过（无 P0；S1–S6 六大场景真实浏览器全绿，
    94/94 e2e + 298/298 单测），但生产构建隔离判定存在 1 项 P1（F-001：DesignSystemView 演示展示 chunk
    含 '示例客户 A' 等特征字符串进入 dist，违反「dist 不含演示数据特征字符串」标准）。
    按「P0/P1 必须修复、不得降级掩盖」，INDEPENDENT_QA 不能判 PASS。
  next_step: >-
    主 Agent 将 F-001 分配给集成/路由所有者修复（构建期隔离 DesignSystemView 动态导入），
    F-002 分配至 D/E 任一展示常量归属方，F-003～F-008 酌情排期；
    修复后由 Agent H 复验（重跑 npm run build + 产物扫描 + test:e2e:prod + qa-cross-page.spec.ts），
    复验通过且 OPEN_P1=0 后 P02_H = VERIFIED、INDEPENDENT_QA = PASS。
```
