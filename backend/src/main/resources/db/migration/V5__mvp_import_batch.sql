-- MVP 上线准备 —— Excel 数据迁移批次记录（MySQL 8）
--
-- 设计要点：
--   1) 批次与行明细全部落库，导入结果可追溯（成功→业务单据类型 + 主键）；
--   2) 同一模板 + 同一文件内容（SHA-256）只允许一个批次（重复导入防护最终防线）；
--   3) 行级幂等键由「模板 + 行内容」派生，重复确认同一内容行由业务服务幂等返回原单据；
--   4) 不存金额/余额派生值：核对结果一律实时读取真实业务表。

CREATE TABLE imp_batch (
    id             BIGINT      NOT NULL AUTO_INCREMENT,
    batch_no       VARCHAR(32) NOT NULL,
    template_code  VARCHAR(32) NOT NULL,
    file_name      VARCHAR(255) NOT NULL,
    file_sha256    CHAR(64)    NOT NULL,
    status         VARCHAR(16) NOT NULL DEFAULT 'PARSED',
    total_rows     INT         NOT NULL DEFAULT 0,
    success_rows   INT         NOT NULL DEFAULT 0,
    failed_rows    INT         NOT NULL DEFAULT 0,
    duplicate_rows INT         NOT NULL DEFAULT 0,
    created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(64) NOT NULL DEFAULT 'system',
    imported_at    DATETIME    NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_imp_batch_no (batch_no),
    UNIQUE KEY uk_imp_batch_file (template_code, file_sha256),
    KEY idx_imp_batch_created (created_at),
    CONSTRAINT chk_imp_batch_status CHECK (status IN ('PARSED', 'IMPORTED', 'FAILED')),
    CONSTRAINT chk_imp_batch_template CHECK (template_code IN (
        'CUSTOMER', 'SUPPLIER', 'SHAREHOLDER', 'FUND_ACCOUNT',
        'CONTRIBUTION', 'EXPENSE', 'RECEIVABLE', 'RECEIPT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE imp_batch_row (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    batch_id     BIGINT       NOT NULL,
    row_no       INT          NOT NULL,
    status       VARCHAR(16)  NOT NULL,
    message      VARCHAR(500) NULL,
    biz_doc_type VARCHAR(32)  NULL,
    biz_doc_id   BIGINT       NULL,
    row_data     VARCHAR(2000) NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(64)  NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_imp_batch_row (batch_id, row_no),
    KEY idx_imp_batch_row_status (batch_id, status),
    CONSTRAINT fk_imp_batch_row_batch FOREIGN KEY (batch_id) REFERENCES imp_batch (id),
    CONSTRAINT chk_imp_batch_row_status CHECK (status IN ('SUCCESS', 'FAILED', 'DUPLICATE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
