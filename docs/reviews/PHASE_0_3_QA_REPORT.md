# Phase 0.3 独立质量审核报告（Agent D / P03-D）

> 审核人：Independent QA（Phase 0.3 Agent D）｜审核时间：2026-11-27 16:17–17:05（Asia/Shanghai）
> 审核对象：Phase 0.3 集成代码（A 财务边界 / B 环境隔离 / C UI 优化 三路整改合入后）
> 证据原则：全部结论来自独立真实执行（真实浏览器、真实命令输出、真实产物扫描、真实截图目检）；
> 未采信任何开发 Agent 自测报告数值，全部重新构建/重跑/复扫。
> 独立交付物：`frontend/e2e/qa-regression.spec.ts`（R1/R2/R4）、`frontend/e2e/qa-idempotency.spec.ts`（R3）、
> `frontend/e2e/qa-ui-review.spec.ts`（C1–C6 UI Review + 证据截图）；生产代码零改动。

---

```yaml
reviewed_commit:
  branch: phase-0.3/agent-d-qa
  head: 6da05d4 "chore: pin playwright locale/timezone for visual determinism, retarget screenshot output to phase-0.3"
  baseline: 6da05d4 = 任务给定集成基线（含 A/B/C 全部整改），本分支与其一致
  production_code_changes: none（git status 仅新增 3 个 qa-*.spec.ts + 本报告）
  commits_under_review: |
    d7173df..HEAD 共 9 提交：
    44c9aae docs(execution plan) [主 Agent]
    32734e0 feat(isolation): explicit env allowlist + multi-mode artifact verification [B]
    341f12c merge: P03-B (verified) [主 Agent]
    661e1a5 fix(prototype): unambiguous idempotency serialization, date consistency, derived integrity [A]
    af07f89 fix(prototype): align receivable creation semantics with spec (income recognition constraint) [A]
    8773e27 merge: P03-A (verified) [主 Agent]
    77e1508 feat(ui): dashboard list limits, unified date components, sidebar & table refinement [C]
    5389e3b merge: P03-C (verified) [主 Agent]
    bb57315 / 6da05d4 截图产物治理与视觉确定性 [主 Agent]

architecture_review:
  overall: PASS
  file_ownership:
    verdict: PASS
    evidence: >-
      git log d7173df..HEAD --name-only 逐提交核对执行计划第 3 节所有权表：
      A（661e1a5/af07f89）仅 features/prototype/{repository,domain,tests}/**，
      contracts/types.ts 变更严格限定于预授权 V1.2（ReceivableIntegrityDiagnostic +
      ReceivableSummary.integrity?，+27/−4 行，无其他契约漂移）；
      B（32734e0）仅 app/config.ts、router/index.ts（执行计划显式授权共享写入）、
      app/envAllowlist.{ts,test.ts}（隔离开关语义唯一来源，B 职责内新增）、
      scripts/verify-isolation.mjs、e2e/isolation.spec.ts、playwright.isolation.config.ts；
      C（77e1508）仅 components/**、features/**（prototype 未触碰）、app/navigation.ts、
      e2e/**（qa-*/isolation 未触碰）；另触碰 app/app-shell.test.ts（app/** 共享边缘，
      纯测试新增导航行为断言、无生产语义，经主 Agent merge 时裁决合入——见 QA-F002）
      与 artifacts/screenshots/phase-0.2/*.png（后由主 Agent bb57315 恢复历史证据）。
  contract_v12:
    verdict: PASS_WITH_NOTE
    evidence: >-
      types.ts diff 审核：新增 ReceivableIntegrityDiagnostic{status:'OK'|'OVER_ALLOCATED',
      overAllocatedAmount} 与 ReceivableSummary.integrity?，其余为注释澄清，
      属执行计划「预授权 V1.2：ReceivableSummary 增加完整性诊断字段」范围；
      契约文档 PROTOTYPE_DATA_CONTRACT.md 仍标 V1 (FROZEN)、未记录 V1.2 修订（QA-F001）。
  single_store: PASS
  single_store_evidence: >-
    grep defineStore 全库 2 处：features/prototype/stores/prototype.ts（唯一业务 Mock Store，
    state + MemoryPrototypeRepository 同源单一数据源）与 stores/app.ts（纯 UI 壳状态）。
  date_ui_vs_domain:
    verdict: PASS
    evidence: >-
      收款日期：BusinessDateInput max=DEMO_TODAY（UI）＋ validateReceiptAllocation 拒绝
      receiptDate > DEMO_TODAY（Domain 最终防线）双层一致——R4 双层实证；
      应收日期：UI 无 max（未来允许创建）＋ createReceivable 允许未来月/未来对账日期
      ＋ reporting.ts 收入确认过滤——与「创建未来月应收单允许、不计入已确认收入」裁决一致（R4 补充实证）。
  isolation_switch_uniqueness:
    verdict: PASS
    evidence: >-
      envAllowlist.ts 为语义唯一来源（default-deny 允许清单 = development/test）：
      运行期纯函数（router beforeEnter、config）＋构建期字面量比较链常量（死分支折叠）双形态，
      envAllowlist.test.ts 断言双形态一致（含大小写/空白/未知 mode 16 种禁用变体）；
      旧 MODE !== 'production' 语义已废除（config.ts/router/index.ts diff 核对无残留）。
  duplicate_components_and_logic:
    verdict: PASS
    evidence: >-
      receipts/DateField.vue 已删除；grep 'type="date"' 全库 0 命中；日期输入统一
      components/ui/date/**（BusinessDateInput/AccountingMonthInput/DateRangeInput/
      OperationDateTimeInput + CalendarPopover/MonthPickerPopover）；
      TRANSACTION_TYPE_LABELS 单源 contracts/labels.ts（dashboard 用显式图表短标签别名、
      treasury 复用标准标签，无本地双份映射）；财务公式仍仅 domain/*.ts 单点实现。
  tech_stack_changes: PASS
  tech_stack_evidence: "git diff d7173df..HEAD -- frontend/package.json package-lock.json tsconfig*.json vite.config.ts 为空；锁定版本零变化"

financial_review:
  overall: PASS
  decimal_precision:
    verdict: PASS
    evidence: >-
      grep parseFloat|Math.round 全库命中 0（除注释）；Number 路径逐一定性：
      Number.parseInt = 日期解析（dateRules/calendarValue/dateText）与单据序号；
      Number() = chartData.toChartNumber（仅 ECharts 几何值，展示一律 formatAmount，
      沿用 Phase 0.2 豁免结论）、TablePagination 页大小、测试计数；
      金额运算全程 utils/decimal.ts BigInt 定点（idempotency.ts 金额规范化亦走
      normalizeAmount + canonicalAmount2，FNV-1a 哈希用 BigInt）。
  idempotency:
    verdict: PASS
    evidence: >-
      idempotency.ts Netstring 风格长度前缀序列化（{len}:{content}. 逐字段 + 版本前缀 rp1），
      等价性判据 = 规范化参数串直接比较（哈希仅索引）；R3 三场景真实浏览器实证
      （见 regression_R1_R5.R3）；幂等索引防原型链污染（getIdempotencyRecord/setIdempotencyRecord
      own-property + defineProperty，Object.create(null) 容器）经代码审核确认。
  date_boundaries:
    verdict: PASS
    evidence: >-
      isValidLocalDate 真实公历校验（UTC 探针，闰年含 1900/2000 边界）；
      未来收款拒绝（UI max + Domain 强制）与未来月收入排除（isRecognizedRevenue：
      accountingMonth ≤ 2026-11 且 statementDate ≤ DEMO_TODAY）经 R4 实证。
  derived_integrity:
    verdict: PASS
    evidence: >-
      deriveReceivableSummary 超额核销不再静默钳制：paidAmount 保留真实合计、
      outstandingAmount 展示 '0.00'、integrity={OVER_ALLOCATED, 差额} 显式暴露
      （integrity.test.ts 断言 150.00/50.00、0.01 级 BigInt 精度）；派生值与异常标记并存。
  single_source_and_cross_page:
    verdict: PASS
    evidence: >-
      余额不缓存（recomputeAccountBalance = 期初 + RECORDED IN − RECORDED OUT）；
      R1 同一会话六处断言 + Pinia Store 集合计数互证（见 regression_R1_R5.R1）。
  reporting_comment_drift: QA-F003（P3，注释与裁决后创建语义不符，行为正确）

isolation_review:
  verdict: PASS
  methodology: >-
    不轻信 B 报告：四 mode 产物全部由 QA 重新独立构建（npx vite build --mode <m>），
    行为层用真实浏览器重新验证（production/staging 用 playwright.isolation.config.ts；
    uat/demo-custom 用 QA 临时配置复用 e2e/isolation.spec.ts 全套断言，
    临时配置置于 %TEMP% 避开 outputDir 清理，不入版本库）；
    产物层用 scripts/verify-isolation.mjs 独立复扫并核对扫描完整度。
  behavior_layer:
    production: "5/5 PASS（App Shell 可用 + /workbench 安全回退 + 演示路由 5 条全部回退 + /dev/design-system 不可用 + 模拟收款确认不可执行）"
    staging: "5/5 PASS（同上全套断言）"
    uat: "5/5 PASS（同上全套断言，QA 临时配置 project→uat preview）"
    demo_custom: "5/5 PASS（同上全套断言，QA 临时配置 project→demo-custom preview）"
    prod_guard: "npm run test:e2e:prod 1/1 PASS（16.2s）"
  artifact_layer:
    scanner: scripts/verify-isolation.mjs（30 特征 × 字面 UTF-8/UTF-16LE/UTF-16BE + \uXXXX 转义大小写双形态五形态检索 + 骨架对照 + chunk 文件名对照）
    production: "598 文件 / 17,351,199 字节（.js×1 .css×1 .html×1 .woff2×301 .woff×294）；forbidden_total_hits=0；骨架 7/7 命中（工厂财务=3 工作台=1 经营概览=2 资金管理=1 业务管理=1 应收账款=2 该功能尚未实现=1）；演示 chunk 文件名 0；RESULT PASS"
    staging: "598 文件 / 17,351,193 字节；0 命中；骨架 PASS；RESULT PASS"
    uat: "598 文件 / 17,351,185 字节；0 命中；骨架 PASS；RESULT PASS"
    demo_custom: "598 文件 / 17,351,201 字节；0 命中；骨架 PASS；RESULT PASS"
    test_control: >-
      619 文件 / 18,877,457 字节；224 命中 + 8 个演示 chunk 文件名（DashboardView/DesignSystemView/
      ReceiptsView/ReceivableDetailView/ReceivablesView/TransactionsView/prototype/receivableList）；
      expect_demo_check=PASS —— 允许清单内 mode 演示内容完好（证明扫描非空洞、build:test/E2E 依赖未被破坏）
    completeness: >-
      文件数/字节数/扩展名分布四 mode 一致（598 文件、差异仅 mode 字符串长度），
      骨架对照全 PASS，无空扫描误判。

ui_review:
  verdict: PASS
  method: 真实浏览器 1920/1440/1280/390 四档 × 四核心页面（qa-ui-review.spec.ts + 证据截图逐一目检）
  checks:
    C1_list_limits_and_balance: >-
      PASS——桌面 1920 近期资金流水/待收加工费各 8 条（≤8）、双列面板同排等宽（宽差 <8%）；
      移动 390 各 5 条（listLimit.ts 展示层截取，不改写数据）。
    C2_date_components: >-
      PASS——手动输入/日历点选（2026-11-15 回填）/清空必填/键盘（Enter 开 ESC 关）/
      非法日期（2026-02-30）/闰年（2025-02-29 拒、2024-02-29 过）/max 限制（2026-12-05 拒）/
      区间顺序校验（开始>结束报错）+ 真实过滤（2026-11-01~10 命中 4 条）全部实证。
    C3_sidebar: >-
      PASS——详情页（/business/receivables/ar-001）父级「应收账款」aria-current 高亮、
      不误亮同组其他项；整组未实现仅分组级「规划中」×3（财务核算/基础资料/系统）、
      无逐项「未实现」噪音；四个已交付原型页链接正常可达。
    C4_tables: >-
      PASS——流入/流出双列语义（IN 落流入列、OUT 落流出列、另一列 '—'，非仅颜色）；
      金额 span.amount 右对齐 + tabular-nums（computed style 实证）；
      对账单编号 DocumentNumber link 视觉（text-brand-foreground）可点击进详情。
    C5_responsive: >-
      PASS——运行时解除全部 overflow-x-clip 防护后，四档视口 × 四页面均无页面级横向溢出
      （独立复核 layout-audit.spec.ts 结论成立，无被 clip 遮盖的真实布局错误）；
      移动端宽表格为容器内滚动（列 min-width 96px 不换行，F-007 修复保持）。
    C6_consistency: >-
      PASS——四页面 computed style 全量扫描：渐变 0、阴影 0、Emoji 0、
      营销文案 0（赋能/立即体验/一键生成/让财务更简单/一站式/智能提升）；白面板/细边框/
      克制主操作样式保持；演示数据标注（演示模式·非真实财务数据/虚构演示数据）齐全。
  screenshot_quality:
    verdict: PASS
    evidence: >-
      artifacts/screenshots/phase-0.3/ 18 张交付截图抽查（dashboard-1920x1080 /
      receivable-detail / receipts-390 等）：分辨率正确、内容完整、金额与 fixtures 一致、
      Header 均位于图首。
  header_artifact_review:
    verdict: EVIDENCE_CHAIN_VALID（C 的判定成立）
    evidence: >-
      ① 真实布局证据：layout-audit.spec.ts 断言 sticky Header rect.top 在滚动前后恒为 0
      （通过）；② 伪影复现证据 A：header-artifact-scrolled.png（滚动态 fullPage）中
      Header 拼接于页面中部 y≈628，与历史缺陷形态一致；③ 修复证据 B：
      header-artifact-scrolled-fixed.png 与 phase-0.3 全部交付截图（scrollTop=0 采集，
      screenshots.spec.ts shotFullPage）Header 回到图首。
      结论：sticky + fullPage 拼接的截图采集伪影判定成立，采集流程修复有效，非 UI 缺陷。

regression_R1_R5:
  harness: >-
    frontend/e2e/qa-regression.spec.ts + qa-idempotency.spec.ts（真实浏览器、
    同一会话标记 __QA_D_SAME_SESSION__ 防刷新孤立验证、确定性 fixtures、
    Pinia Store 集合计数经应用实例互证）；$env:E2E_PORT='4178' 执行 22/22 PASS（49.2s）
  R1:
    status: PASS
    key_numbers: >-
      15,000.00 核销 ar-001=8,000.00 + ar-002=7,000.00 后（同一会话）：
      收款单 8→9（SK-2026-0009 / 15,000.00 / 已核销 15,000.00 / 未分配 0.00 / 已全额核销）；
      资金流水 22→23（FT-2026-0023 / 流入 15,000.00 / 流出 '—' / 关联收款单 SK-2026-0009）；
      核销明细 10→12（ar-001 详情 1 行 8,000.00、ar-002 详情 1 行 7,000.00）；
      资金余额 77,661.45→92,661.45（+15,000.00）；应收余额 402,567.87→387,567.87（−15,000.00）；
      期间加工收入 99,278.32→99,278.32（Δ0.00）；
      ar-001 已结清（8,000/8,000/0.00）、ar-002 部分回款（12,000/7,000/5,000）。
  R2:
    status: PASS
    key_numbers: >-
      新建应收 10,000.00（2026-11）：应收 24→25（AR-2026-0025 / 10,000.00 / 未收 10,000.00）；
      应收余额 402,567.87→412,567.87（+10,000.00）；期间加工收入 99,278.32→109,278.32（+10,000.00）；
      资金余额 77,661.45（Δ0.00）；资金流水 22→22（Δ0）；收款单 8→8（Δ0）。
  R3:
    status: PASS
    key_numbers: >-
      ① 重复确认仅一笔：确认按钮双击 → 收款单 8→9（SK-2026-0009 唯一）、
      流水 22→23（FT-2026-0023 唯一）、ar-001 已收 8,000.00/ar-002 未收 5,000.00 未重复扣减。
      ② 同键异参 CONFLICT（A1 分隔符序列化冲突场景，Date.now/Math.random 固定
      使两会话同键）：externalRef='BANK#A'+remark='B' 与 externalRef='BANK'+remark='A#B'
      → 第二次确认报「同一幂等键的业务参数不一致」CONFLICT、无成功结果、零状态变化
      （9 单/23 流水/ar-002 已收 1,000.00）；搜 'BANK#A' 命中 1 张、搜 'A#B' 命中 0 张
      （冲突参数未落库；旧 join('#') 序列化两组参数串同为 'BANK#A#B' 将被误判同参，
      整改后必须区分——实证成立）。
      ③ 不同键独立单：两组参数分别确认 → SK-2026-0009 + SK-2026-0010 两张独立收款单、
      流水 22→24、ar-002 累计已收 2,000.00/未收 10,000.00。
  R4:
    status: PASS
    key_numbers: >-
      ① 未来日期收款（2026-12-01）拒绝：UI 层报「日期不得晚于 2026-11-30」且确认禁用；
      Store/Domain 最终防线（真实浏览器内直接调用 confirmReceipt，绕过 UI）拒绝
      「实际到账日期不得晚于演示基准日 2026-11-30（未来日期收款必须拒绝）」；
      逐字段快照全部不变（资金 77,661.45 / 应收 402,567.87 / 收入 99,278.32 /
      回款 37,246.01 / 支出 43,150.50；收款单 8 / 流水 22 / 核销 10 / 应收单 24）。
      ② 未来月应收单（2026-12 / 2026-12-05 / 5,000.00）允许创建（AR-2026-0025）；
      统计区间扩展至 2026-12-31（2026-11-01~2026-12-31）后已确认收入仍 99,278.32
      （误计应为 104,278.32）——未来月单据不计入截至 2026-11-30 的已确认收入；
      应收余额 407,567.87（+5,000，Σ 全部未收）；流水 22/收款单 8 不变。
  R5:
    status: PASS
    key_numbers: >-
      四环境（production/staging/uat/demo-custom）：行为层 20/20 PASS
      （演示路由全部安全回退 /workbench、模拟财务操作不可执行、App Shell 与占位页正常）；
      产物层 4×598 文件（~17.35 MB）30 特征 × 五形态全量扫描 0 命中、骨架对照全 PASS、
      演示 chunk 文件名 0；test 模式对照 619 文件 224 命中 + 8 演示 chunk
      （扫描非空洞、允许清单内演示完好）；prod-guard 1/1。

tests_executed:
  - cmd: npm ci
    result: PASS
    detail: "added 225 packages in 10s（EBADENGINE 警告延续，已知项不影响测试）"
  - cmd: npm run type-check
    result: PASS
    detail: "vue-tsc --noEmit ×2（tsconfig.json + tsconfig.node.json，含 e2e qa specs）exit 0"
  - cmd: npm test
    result: PASS
    detail: "Vitest 35 files / 409 tests 全部通过（19.29s；较 Phase 0.2 的 300 增至 409）"
  - cmd: "$env:E2E_PORT='4178'; npx playwright test e2e/qa-regression.spec.ts e2e/qa-idempotency.spec.ts e2e/qa-ui-review.spec.ts"
    result: PASS
    detail: "22/22 通过（49.2s）：R1/R2/R4×2 + R3×3 + C1×2/C2×2/C3/C4/C5×4/C6/截图×4"
  - cmd: "$env:E2E_PORT='4179'; npx playwright test"
    result: PASS
    detail: "134 通过 / 5 跳过（isolation 套件按设计在 test 构建下跳过）/ 0 失败（2.2m）；含既有共享 spec + date-inputs/layout-audit/screenshots（生成 artifacts/screenshots/phase-0.3/ 18 张）"
  - cmd: "$env:E2E_PORT='4178'; npx playwright test -c playwright.isolation.config.ts"
    result: PASS
    detail: "10/10（27.0s）：production-build 5/5 + staging-build 5/5（真实浏览器行为隔离）"
  - cmd: "$env:QA_EXTRA_PORT='4178'; npx playwright test -c %TEMP%/qa-isolation-extra.config.ts"
    result: PASS
    detail: "10/10（27.0s）：uat + demo-custom 构建产物行为隔离（复用 e2e/isolation.spec.ts 全套断言；QA 临时配置，不入版本库）"
  - cmd: node scripts/verify-isolation.mjs（production/staging/uat/demo-custom + test --expect-demo）
    result: PASS
    detail: "四 mode 各 598 文件 0 命中 PASS；test 对照 619 文件 224 命中 + 8 演示 chunk expect_demo PASS"
  - cmd: npm run test:e2e:prod
    result: PASS
    detail: "1/1 通过（16.2s）：/dev/design-system 生产构建守卫重定向"

test_results:
  R1_cross_page: PASS（关键数值见 regression_R1_R5.R1；同一会话标记全程存活）
  R2_create_receivable: PASS（关键数值见 regression_R1_R5.R2）
  R3_idempotency: PASS（三场景含 A1 分隔符序列化冲突实证，见 regression_R1_R5.R3）
  R4_future_date: PASS（UI + Store 双层拒绝 + 逐字段零变化 + 未来月收入排除判别，见 regression_R1_R5.R4）
  R5_isolation: PASS（四环境行为 20/20 + 产物 4×0 命中 + test 对照，见 regression_R1_R5.R5）

test_authenticity:
  verdict: PASS
  detail: >-
    抽查全部新测试断言真实性：A 的 idempotency.test.ts（'BANK#A'/'BANK'+'A#B' 错位组合
    not.toBe、':'/'|' 错位组合、引号/换行/Unicode 无歧义）、integrity.test.ts
    （150.00/50.00 OVER_ALLOCATED、0.01 级 BigInt 精度、paidAmount 不截断）、
    dateConsistency.test.ts（11 类非法日期、1900/2000 闰年边界、失败前后 snapshot
    逐字段比对）；B 的 envAllowlist.test.ts（16 种禁用 mode 变体逐一断言 + 双形态一致）；
    C 的 dashboard-components.test.ts（真实 store.getDashboardSummary + 路由断言）、
    date-inputs.spec.ts / layout-audit.spec.ts（具体错误文案、computed style、
    解除防护后溢出数值断言）。全部为金额/行数/状态/样式具体断言，
    未发现「输入框有字」式假测试；QA 自建 22 用例全部为数值/状态/错误文案断言。

findings:
  - id: QA-F001
    severity: P3
    file: docs/PROTOTYPE_DATA_CONTRACT.md
    title: 契约文档未同步 V1.2 修订记录（代码契约已含 integrity 完整性诊断字段）
    reproduction: "对比 frontend/src/features/prototype/contracts/types.ts（标注 V1.2 增量、ReceivableIntegrityDiagnostic）与 docs/PROTOTYPE_DATA_CONTRACT.md（仍标 V1 FROZEN，正文无 V1.2 章节）"
    expected: "契约文档版本记录与代码契约一致（V1.2 增量经主 Agent 预授权裁决后应补记文档）"
    actual: "PROTOTYPE_DATA_CONTRACT.md 第 9 节版本仍为 V1 (FROZEN)、无 V1.2 修订条目；任务必读清单描述的『含 V1.2 integrity』未体现在文档中"
    recommended_fix: >-
      主 Agent（文档所有权）在 PROTOTYPE_DATA_CONTRACT.md 补记 V1.2 修订
      （ReceivableSummary.integrity / ReceivableIntegrityDiagnostic 语义与预授权出处
      = PHASE_0_3_EXECUTION_PLAN.md 第 3 节），版本区更新为 V1.2。
      不影响运行期行为，可随 Wave 4 一并处理；不阻断最终视觉基线。
  - id: QA-F002
    severity: P3
    file: docs/DECISION_LOG.md
    title: Phase 0.3 重要决策未记账（契约 V1.2、隔离开关语义切换、共享文件变更裁决）
    reproduction: "grep 'Phase 0.3|V1.2|envAllowlist' docs/DECISION_LOG.md → 0 命中"
    expected: "AGENTS.md 第 2/6 节：依赖/契约/开关语义等重要决策记录于 DECISION_LOG.md（Phase 0.2 已有此惯例）"
    actual: "DECISION_LOG.md 无任何 Phase 0.3 条目：① 契约 V1.2 预授权与实施；② 隔离开关从 MODE!=='production' 切换为 envAllowlist 允许清单语义；③ C 修改共享边缘文件 app/app-shell.test.ts（纯测试）经主 Agent merge 裁决的记录"
    recommended_fix: >-
      主 Agent 补记 3 条 DECISION_LOG 条目（可与 QA-F001 同批处理）。
      文档缺口，无功能影响；不阻断最终视觉基线。
  - id: QA-F003
    severity: P3
    file: frontend/src/features/prototype/domain/reporting.ts:56-65
    title: isRecognizedRevenue 注释与裁决后应收创建语义不符（行为正确，注释误导）
    reproduction: "阅读 reporting.ts 收入确认口径注释『写时校验（createReceivable 拒绝未来月份/未来对账日期）是第一道防线』；对照 memoryPrototypeRepository.validateCreateReceivableCommand（af07f89 裁决后允许未来月/未来对账日期创建，注释自身写明『含未来月允许创建/登记』）"
    expected: "注释与实现一致：未来月/未来对账日期应收单允许创建，收入确认由报告层防御性过滤排除"
    actual: "reporting.ts 注释仍称写时校验会拒绝未来单据，与实现相反（实现行为经 R4 补充场景验证正确：未来月可创建且不计入已确认收入）"
    recommended_fix: >-
      Agent A 修正 reporting.ts 注释（改为『未来单据允许创建，报告层按
      isRecognizedRevenue 过滤未确认收入』），或由主 Agent 裁决后统一。
      纯注释修订，零行为变更；可延期至 Wave 4。

summary_counts:
  total_findings: 3
  P0: 0
  P1: 0
  P2: 0
  P3: 3
  note: "全部为文档/注释级缺口；无财务错误、无数据不一致、无生产泄露、无视觉基线影响"

overall_status:
  P03_D: VERIFIED
  OPEN_P0: 0
  OPEN_P1: 0
  INDEPENDENT_QA: PASS
  reason: >-
    基于最终集成代码（6da05d4）的独立审核全部完成：架构（所有权/契约 V1.2 范围/单一 Store/
    日期双层一致/隔离开关唯一语义/无重复组件与技术栈漂移）与财务（精确运算/幂等序列化/
    日期边界/integrity 显式诊断/单一数据源/跨页面一致）全部 PASS；
    5 项强制回归 R1–R5 真实浏览器全绿（含 A1 分隔符序列化冲突场景与四环境隔离复核）；
    UI Review C1–C6 四档视口全绿、截图质量与 Header 伪影证据链成立；
    type-check / 409 单测 / 全量 e2e 134+22 / 隔离 20+10 / 产物扫描 4×0 命中 + test 对照 /
    prod-guard 全部真实执行通过。仅 3 项 P3 文档/注释缺口（记录并建议 Wave 4 处理，
    不影响最终视觉基线）。满足 STOP CONDITION：P03_D = VERIFIED 且 OPEN_P0=0、
    OPEN_P1=0、INDEPENDENT_QA = PASS。
  visual_baseline: >-
    UI Review 结果支持 VISUAL_BASELINE 进入 CANDIDATE（CANDIDATE_READY_FOR_APPROVAL
    仍需架构师/产品负责人裁定，沿用执行计划已知限制）。
  next_step: >-
    QA-F001/QA-F002 分配主 Agent（文档补记）、QA-F003 分配 Agent A（注释修订），
    Wave 4 一并处理后无需复验功能（零行为变更）；如 Wave 4 触碰生产代码则须重跑
    qa-*.spec.ts 复验。
```

---

## 附：执行环境与端口记录

| 项 | 值 |
| --- | --- |
| Node | 24.14.0（EBADENGINE 已知警告延续，测试不受影响） |
| QA 回归端口 | E2E_PORT=4178（qa-*.spec.ts 22 用例） |
| 全量套件端口 | E2E_PORT=4179 |
| 隔离套件端口 | E2E_PORT=4178（production=4178 / staging=4180，配置内 E2E_PORT+2 约定） |
| uat/custom 隔离端口 | QA_EXTRA_PORT=4178（uat=4178 / demo-custom=4179） |
| prod-guard 端口 | 4175（playwright.prod.config.ts 固定） |
| QA 临时工件 | %TEMP%/qa-isolation-extra.config.ts（复用 isolation.spec.ts 验证 uat/custom；%TEMP%/node_modules junction；均不入版本库） |
| QA 证据截图 | frontend/test-results/qa/ui-review-{dashboard,transactions,receivables,receipts}-{1920,1440,1280,390}.png + header-artifact-{scrolled,scrolled-fixed}.png（test-results/ 不入版本库） |
| 交付截图 | artifacts/screenshots/phase-0.3/ 18 张（screenshots.spec.ts 采集，scrollTop=0 修正后） |
