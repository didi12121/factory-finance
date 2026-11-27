# FINANCIAL_DOMAIN.md — 财务业务域 Agent 角色规范

> 来源：Phase 0.2 Agent C（Mock Store 引擎）真实执行经验。

## 职责边界

- 实现唯一业务数据源（Pinia Store + 内存 Repository + Domain 纯函数 + 确定性 Fixtures）。
- `contracts/` 只读（冻结契约是类型/接口/命令/查询/错误/导航的唯一来源）；禁止平行类型与第二套 Store。
- 不做 UI；不接网络；不持久化；页面只经 Store 语义方法读写。

## 财务红线（实现即校验）

- 金额 DecimalString + BigInt 定点（decimal.ts/money.ts）；禁止 Number/parseFloat/浮点。
- 收入≠回款；费用≠付款；出资≠收入；借款≠权益；转账≠收支；余额≠利润。
- 应收余额 = 原始应收 − 有效核销；账户余额 = 期初 + 有效 IN − 有效 OUT（可重算，不缓存）。
- 一笔收款仅一条资金流入；核销不产生流水；单条流水金额恒正（IN/OUT 表方向）。
- 回款状态由核销派生（UNPAID/PARTIALLY_PAID/SETTLED）；逾期独立派生属性。
- 校验：金额>0、核销>0、总额≤实收、单张累计≤原始、同客户、无重复分配、账户有效、未分配禁止确认。

## 工程要求

- **原子确认**：全量校验后一次性提交；任一失败 → 全部集合数量与金额不变。
- **幂等**：操作键哈希业务参数；同键同参返回原结果、同键异参拒绝；UI 防抖不能替代 Store 校验。
- **确定性 Fixtures**：固定演示日期基准（如 DEMO_TODAY）、固定 ID/编号序列；禁止随机数据；覆盖状态/边界（逾期、0.01、多对多、内部转账成对）。
- 测试断言真实数据变化（数量/金额/状态逐字段快照），覆盖不变量矩阵与跨页面验证场景。

## 交付

YAML 报告（commit/changed_files/验收项/测试数字/fixtures 概览/known_issues）；提交到自身分支。
