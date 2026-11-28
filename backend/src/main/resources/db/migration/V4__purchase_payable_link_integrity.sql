-- MVP 上线准备 —— 采购支出与应付单关联完整性（MySQL 8）
--
-- 业务规则：
--   1) 同一笔采购支出（已由 Phase 1 直接支付）最多关联一张**有效**应付单；
--   2) 应付单撤销后关联自动解除（生成列在 status <> 'CONFIRMED' 时为 NULL）；
--   3) 已关联有效应付单的采购支出禁止直接撤销（应用层事务校验，见 VoidService）。
--
-- 实现：以 STORED 生成列 + 唯一索引表达「有效关联唯一」；不修改历史迁移文件。

ALTER TABLE pay_payable
    ADD COLUMN funded_expense_key BIGINT
        GENERATED ALWAYS AS (
            CASE WHEN funded_expense_id IS NOT NULL AND status = 'CONFIRMED'
                 THEN funded_expense_id ELSE NULL END
        ) STORED,
    ADD UNIQUE KEY uk_pay_payable_funded_expense (funded_expense_key);

-- 便于按采购支出反查关联应付单（撤销前置校验与列表展示）
CREATE INDEX idx_pay_payable_funded_expense ON pay_payable (funded_expense_id);
