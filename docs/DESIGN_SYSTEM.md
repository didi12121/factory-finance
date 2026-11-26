# Factory Finance — Design System V1.0

> 本文档与 `frontend/src/styles/tokens.css` 保持一致：Token 名称与值**原样**来自该文件（Tailwind CSS 4 CSS-first `@theme` 映射）。
> Token 是本项目自己的初始设计规范，不是 Stripe 官方完整设计规范。
> 业务页面禁止直接散落十六进制颜色值，统一使用 Token。

## 1. Color Tokens

以下值与 `frontend/src/styles/tokens.css` 的 `@theme` 块逐行一致：

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

语义约定：

- `brand`：主操作按钮、链接、选中态；hover 用 `brand-hover`，浅色选中/高亮背景用 `brand-subtle`。
- `text-primary` 标题与关键数字、`text-secondary` 正文、`text-muted` 辅助文字。
- `background` 页面底色、`surface` 卡片/面板/浮层底色、`surface-hover` 行悬停、`border` 边框与分割线。
- `success/warning/danger` 状态文字与图标；对应 `-subtle` 为状态浅色背景（Badge、提示条）。
- 品牌主色为紫色，但**不允许将整个页面设计为紫色主题背景**（任务文档第 9 节）。

## 2. Typography Tokens

### 2.1 字体方案

```css
--font-sans: 'Inter Variable', 'Noto Sans SC', -apple-system, 'Segoe UI',
  'Microsoft YaHei', sans-serif;
```

- 西文 **Inter**（`@fontsource-variable/inter` 5.3.0）+ 中文 **Noto Sans SC**（`@fontsource/noto-sans-sc` 5.3.1），均由 **npm 字体包本地分发**（随构建产物打包），**不依赖国外字体 CDN**。
- 系统字体回退：`-apple-system` / `Segoe UI` / `Microsoft YaHei`，保证字体加载失败时的可读性。

### 2.2 字号/行高（与 tokens.css 一致）

```css
--text-page-title: 24px;      --text-page-title--line-height: 32px;
--text-section-title: 16px;   --text-section-title--line-height: 24px;
--text-body: 14px;            --text-body--line-height: 22px;
--text-table: 13px;           --text-table--line-height: 20px;
--text-caption: 12px;         --text-caption--line-height: 18px;
--text-metric: 28px;          --text-metric--line-height: 36px;
--text-metric-lg: 32px;       --text-metric-lg--line-height: 40px;
```

字重规范：

| 用途 | 字号 | 字重 |
| --- | --- | --- |
| 页面标题 | 24px | 600 |
| 区域标题 | 16px | 600 |
| 正文 | 14px | 400 |
| 表格正文 | 13px | 400 |
| 辅助文字 | 12px | — |
| 财务核心数字 | 28–32px（`--text-metric` / `--text-metric-lg`） | 600 |

## 3. Layout Tokens

与 `frontend/src/styles/tokens.css` 一致：

```css
--width-sidebar: 224px;
--width-sidebar-collapsed: 56px;
--height-header: 56px;
--height-table-row: 44px;
--height-table-header: 40px;
--height-control: 36px;
--radius-control: 6px;
--radius-panel: 8px;
```

任务文档第 8.3 节的补充布局常量（按约定使用，必要时在 tokens.css 中追加对应变量）：

```text
Page padding:        24px
Section spacing:     24px
Base spacing unit:   4px
```

桌面端优先；布局细则见 `UI_GUIDELINES.md`。

## 4. 金额展示规范

财务数字展示必须同时满足：

1. **千分位分隔**（`,`）、**两位小数**（`.00` 补齐）。
2. **右对齐**（表格列与指标卡数字）。
3. 等宽数字：`font-variant-numeric: tabular-nums;`。
4. 正确处理边界值：`0.00`、`1,850.39`、`-1,850.39`、`1,000,000.00`（负数保留符号，不擅自加括号或红色以外的语义）。
5. 展示格式化只作用于显示层；计算与传输一律使用十进制字符串/`BigDecimal`（见 `ACCOUNTING_RULES.md` 第 2 节），**禁止 JS Number 参与财务运算**。
6. `AmountInput` 验证金额格式与精度，拒绝科学计数法与隐式浮点舍入。

## 5. 可访问性对比度

要求：**正文、按钮、状态文字必须通过可访问性对比度检查**（目标 WCAG 2.1 AA：正文 ≥ 4.5:1，大字号/图形 ≥ 3:1）。

下表为基于 Token 色值的近似对比度（sRGB 相对亮度计算，四舍五入；**最终数值以对比度工具复核为准**）：

| 组合 | 近似对比度 | 结论 |
| --- | --- | --- |
| `text-primary` #1a1f36 / `surface` #ffffff | ≈ 16.2:1 | 通过 |
| `text-secondary` #425466 / `surface` #ffffff | ≈ 7.8:1 | 通过 |
| `text-muted` #697386 / `surface` #ffffff | ≈ 4.8:1 | 通过（贴近 4.5 下限，禁止用于更小字号或更浅背景） |
| 白字 / `brand` #635bff（主按钮） | ≈ 4.7:1 | 通过（按钮文字 ≥ 14px/600） |
| 白字 / `brand-hover` #5147e5 | ≈ 6.2:1 | 通过 |
| `success` #09825d / `success-subtle` #e8f5ee | ≈ 4.3:1 | **临界**：小字号状态文字需使用更深的语义 Token 或加深底色 |

处理原则：

- 对于对比度不足的组合，**定义可访问性专用语义 Token**（示例方向：`--color-success-text`、`--color-warning-text`、`--color-danger-text`，值取对应状态色的加深变体），并记录于本文档。
- 语义 Token 的具体色值：**待架构师/设计确认**，确认前状态文字优先使用纯色 `success/warning/danger` 放在白色/中性背景上。
- 状态信息**不能只通过颜色区分**，必须同时有文字（`FinancialStatus` 组件强制）。
- 每次调整 Token 色值后必须重新执行对比度检查并更新上表。

## 6. 组件清单（三层）

组件按职责分三层组织（任务文档第 10/12 节）：`components/ui`（shadcn/vue 原子组件）、`components/shared`（业务无关通用组件）、`components/finance`（财务通用组件）。禁止为了封装而过度封装。

### 6.1 UI Components（`components/ui`，shadcn/vue 规范本地化实现）

Button、Input、Select、Checkbox、Dialog、Sheet、DropdownMenu、Tabs、Tooltip、Table、Skeleton、Separator、Badge、Toast

### 6.2 Shared Components（`components/shared`）

PageHeader、PageToolbar、DataTable、TablePagination、SearchInput、FilterBar、EmptyState、ErrorState、LoadingState、ConfirmDialog、DetailSheet、FormField

### 6.3 Finance Components（`components/finance`）

| 组件 | 要求 |
| --- | --- |
| MoneyText | 按第 4 节金额展示规范输出；处理 `0.00` / `1,850.39` / `-1,850.39` / `1,000,000.00` |
| AmountInput | 验证金额格式及精度；拒绝科学计数法与隐式浮点舍入 |
| DocumentNumber | 业务单据编号展示（等宽、可复制、不换行） |
| FinancialStatus | 文字 + 语义色表达状态，禁止仅靠颜色区分 |
| FinancialMetric | 财务核心数字指标卡（28–32px/600，右对齐，tabular-nums） |

### 6.4 DataTable 基线能力

列定义、排序、分页、空数据、加载状态，并预留服务端分页能力。

## 7. Design System Showcase

`/dev/design-system` 开发环境页面集中展示 Color Tokens、Typography、Buttons、Inputs、Select、Tabs、DataTable、Dialog、DetailSheet、FinancialMetric、MoneyText、FinancialStatus、EmptyState、LoadingState、ErrorState。展示数据必须是**明确标记的虚构测试数据**，禁止真实客户姓名与真实账目；页面仅在开发或明确启用的测试环境可用。

## 8. Token 变更流程

Token 值的任何修改必须：① 同步更新 `frontend/src/styles/tokens.css` 与本文档；② 记录到 `DECISION_LOG.md`；③ 经架构师批准（UI 设计语言不得未经批准修改）。
