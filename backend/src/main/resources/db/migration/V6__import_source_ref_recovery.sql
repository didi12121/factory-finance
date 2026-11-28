-- MVP 最终业务修复 —— 导入幂等改为「原始记录标识」驱动 + 批次可恢复（MySQL 8）
--
-- 变更要点：
--   1) 行明细新增 source_ref（原始记录标识）、content_hash（规范化内容哈希）、
--      row_values（原始行值 JSON，供中断恢复时重建写命令）、template_code（去重查询免关联）；
--   2) 行状态新增 PENDING：确认导入时先落库待执行行，再逐行执行并回写结果，
--      中断（进程/容器异常）后可按批次恢复未完成行；
--   3) 财务业务去重键 = 模板 + source_ref；主数据仍按名称去重（两套逻辑分离）。

ALTER TABLE imp_batch_row
    ADD COLUMN template_code VARCHAR(32) NULL AFTER batch_id,
    ADD COLUMN source_ref VARCHAR(64) NULL AFTER row_no,
    ADD COLUMN content_hash CHAR(64) NULL AFTER source_ref,
    ADD COLUMN row_values JSON NULL AFTER content_hash;

-- 允许 PENDING（待执行）状态：插入时先落库，执行后回写 SUCCESS/FAILED/DUPLICATE
ALTER TABLE imp_batch_row DROP CHECK chk_imp_batch_row_status;
ALTER TABLE imp_batch_row ADD CONSTRAINT chk_imp_batch_row_status
    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'DUPLICATE'));

-- 按「模板 + 原始记录标识」反查历史导入结果（跨批次幂等与冲突提示）
CREATE INDEX idx_imp_row_source ON imp_batch_row (template_code, source_ref);
CREATE INDEX idx_imp_row_content ON imp_batch_row (template_code, content_hash);

-- 批次恢复审计
ALTER TABLE imp_batch
    ADD COLUMN resumed_at DATETIME NULL AFTER imported_at,
    ADD COLUMN resume_count INT NOT NULL DEFAULT 0 AFTER resumed_at;
