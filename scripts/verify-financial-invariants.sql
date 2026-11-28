-- Phase 2 财务正确性数据库核验脚本（只读，可在任意业务库执行）
--
-- 用法（本地便携 MySQL 示例）：
--   mysql -h 127.0.0.1 -P 3307 -u factory -p factory_finance < scripts/verify-financial-invariants.sql
--
-- 判定口径：以下每个查询返回 0 行 = 该不变式成立；任一行输出 = 违反，必须修复。
-- 覆盖：资金流水唯一/一收一付一条流水、应收应付余额非负、跨客户/供应商核销、
--       核销金额一致、撤销关系可追溯、幂等表与单据对应。

-- 1) 每张收款单恰好一条资金流入流水，且金额一致
SELECT r.id, r.receipt_no, r.actual_amount, t.amount AS flow_amount, COUNT(t.id) AS flow_count
FROM rcv_receipt r
LEFT JOIN tst_fund_transaction t
       ON t.source_doc_type = 'RECEIPT' AND t.source_doc_id = r.id
GROUP BY r.id, r.receipt_no, r.actual_amount, t.amount
HAVING flow_count <> 1 OR t.amount <> r.actual_amount;

-- 2) 每张付款单恰好一条资金流出流水，且金额一致
SELECT p.id, p.payment_no, p.amount, t.amount AS flow_amount, COUNT(t.id) AS flow_count
FROM pay_payment p
LEFT JOIN tst_fund_transaction t
       ON t.source_doc_type = 'PAYMENT' AND t.source_doc_id = p.id
GROUP BY p.id, p.payment_no, p.amount, t.amount
HAVING flow_count <> 1 OR t.amount <> p.amount;

-- 3) 应收单有效核销不得超过原始应收金额（不超额核销）
SELECT r.id, r.statement_no, r.original_amount, SUM(a.allocation_amount) AS allocated
FROM rcv_receivable r
JOIN rcv_receipt_allocation a ON a.receivable_id = r.id AND a.status = 'ACTIVE'
GROUP BY r.id, r.statement_no, r.original_amount
HAVING allocated > r.original_amount;

-- 4) 应付单有效付款核销不得超过应付金额
SELECT p.id, p.payable_no, p.amount, SUM(a.allocation_amount) AS allocated
FROM pay_payable p
JOIN pay_payment_allocation a ON a.payable_id = p.id AND a.status = 'ACTIVE'
GROUP BY p.id, p.payable_no, p.amount
HAVING allocated > p.amount;

-- 5) 不得跨客户核销（核销明细的收款单客户与应收单客户必须一致）
SELECT a.id, a.receipt_id, a.receivable_id
FROM rcv_receipt_allocation a
JOIN rcv_receipt r ON r.id = a.receipt_id
JOIN rcv_receivable ar ON ar.id = a.receivable_id
WHERE r.customer_id <> ar.customer_id;

-- 6) 不得跨供应商核销
SELECT a.id, a.payment_id, a.payable_id
FROM pay_payment_allocation a
JOIN pay_payment p ON p.id = a.payment_id
JOIN pay_payable ap ON ap.id = a.payable_id
WHERE p.supplier_id <> ap.supplier_id;

-- 7) 单张收款单有效核销合计不得超过实际收款金额
SELECT r.id, r.receipt_no, r.actual_amount, SUM(a.allocation_amount) AS allocated
FROM rcv_receipt r
JOIN rcv_receipt_allocation a ON a.receipt_id = r.id AND a.status = 'ACTIVE'
GROUP BY r.id, r.receipt_no, r.actual_amount
HAVING allocated > r.actual_amount;

-- 8) 单张付款单有效核销合计不得超过实际付款金额
SELECT p.id, p.payment_no, p.amount, SUM(a.allocation_amount) AS allocated
FROM pay_payment p
JOIN pay_payment_allocation a ON a.payment_id = p.id AND a.status = 'ACTIVE'
GROUP BY p.id, p.payment_no, p.amount
HAVING allocated > p.amount;

-- 9) 已撤销单据不得保留有效核销明细
SELECT 'receipt' AS doc, r.id, r.receipt_no
FROM rcv_receipt r
JOIN rcv_receipt_allocation a ON a.receipt_id = r.id AND a.status = 'ACTIVE'
WHERE r.status = 'VOIDED'
UNION ALL
SELECT 'payment' AS doc, p.id, p.payment_no
FROM pay_payment p
JOIN pay_payment_allocation a ON a.payment_id = p.id AND a.status = 'ACTIVE'
WHERE p.status = 'VOIDED';

-- 10) 每笔撤销记录必须有目标单据（可追溯），资金类撤销必须有反向流水
SELECT v.id, v.void_no, v.target_doc_type, v.target_doc_id
FROM tst_void_record v
LEFT JOIN tst_fund_transaction t ON t.source_doc_type = 'VOID' AND t.source_doc_id = v.id
WHERE (v.target_doc_type IN ('RECEIPT', 'PAYMENT', 'CONTRIBUTION', 'EXPENSE', 'TRANSFER')
       AND t.id IS NULL);

-- 11) 资金流水金额恒 > 0（方向由 direction 表达）
SELECT id, transaction_no, direction, amount
FROM tst_fund_transaction
WHERE amount <= 0;

-- 12) 应收/应付金额恒 > 0
SELECT 'receivable' AS doc, id, original_amount AS amount FROM rcv_receivable WHERE original_amount <= 0
UNION ALL
SELECT 'payable' AS doc, id, amount FROM pay_payable WHERE amount <= 0;

-- 13) 幂等记录必须绑定到已存在单据（PENDING 残留 = 事务未回滚的异常）
SELECT i.operation, i.idem_key, i.doc_type, i.doc_id
FROM sys_request_idempotency i
WHERE i.doc_type = 'PENDING' OR i.doc_id <= 0;

-- 14) 幂等记录唯一性（同 operation + idem_key 只允许一条）
SELECT operation, idem_key, COUNT(*) AS rows_cnt
FROM sys_request_idempotency
GROUP BY operation, idem_key
HAVING rows_cnt > 1;
