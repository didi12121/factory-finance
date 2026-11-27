-- Phase 1 —— 正式资金管理与日常记账 数据库结构（MySQL 8）
-- 财务规则（docs/ACCOUNTING_RULES.md）：
--   金额 DECIMAL(18,2) 恒 >= 0（方向由 direction 表达）；单据编号唯一；
--   业务写入与资金流水同事务；禁止物理删除/覆盖已确认资金记录；
--   撤销通过反向流水纠正余额并保留原单据与撤销关系。

-- ========== 认证 ==========
CREATE TABLE sys_user (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    display_name  VARCHAR(64)  NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'ENABLED',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_sys_user_username (username),
    CONSTRAINT chk_sys_user_status CHECK (status IN ('ENABLED', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 基础资料 ==========
CREATE TABLE mst_customer (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    customer_no  VARCHAR(32)  NOT NULL,
    name         VARCHAR(128) NOT NULL,
    contact      VARCHAR(128) NULL,
    remark       VARCHAR(500) NULL,
    status       VARCHAR(16)  NOT NULL DEFAULT 'ENABLED',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(64)  NOT NULL DEFAULT 'system',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by   VARCHAR(64)  NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_mst_customer_no (customer_no),
    CONSTRAINT chk_mst_customer_status CHECK (status IN ('ENABLED', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mst_shareholder (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    shareholder_no VARCHAR(32) NOT NULL,
    name          VARCHAR(128) NOT NULL,
    contact       VARCHAR(128) NULL,
    remark        VARCHAR(500) NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'ENABLED',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by    VARCHAR(64)  NOT NULL DEFAULT 'system',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by    VARCHAR(64)  NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_mst_shareholder_no (shareholder_no),
    CONSTRAINT chk_mst_shareholder_status CHECK (status IN ('ENABLED', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 资金账户 ==========
CREATE TABLE tst_fund_account (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    account_no     VARCHAR(32)   NOT NULL,
    name           VARCHAR(128)  NOT NULL,
    account_type   VARCHAR(16)   NOT NULL,
    opening_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    opening_date   DATE          NOT NULL,
    status         VARCHAR(16)   NOT NULL DEFAULT 'ENABLED',
    remark         VARCHAR(500)  NULL,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(64)   NOT NULL DEFAULT 'system',
    updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by     VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tst_fund_account_no (account_no),
    CONSTRAINT chk_tst_fund_account_type CHECK (account_type IN ('BANK', 'CASH', 'WECHAT', 'ALIPAY', 'OTHER')),
    CONSTRAINT chk_tst_fund_account_status CHECK (status IN ('ENABLED', 'DISABLED')),
    CONSTRAINT chk_tst_fund_account_opening CHECK (opening_balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 资金流水（业务操作自动生成，禁止重复录入） ==========
CREATE TABLE tst_fund_transaction (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    transaction_no  VARCHAR(32)   NOT NULL,
    transaction_type VARCHAR(32)  NOT NULL,
    trade_date      DATE          NOT NULL,
    account_id      BIGINT        NOT NULL,
    direction       VARCHAR(8)    NOT NULL,
    amount          DECIMAL(18,2) NOT NULL,
    counterparty    VARCHAR(128)  NULL,
    source_doc_type VARCHAR(32)   NOT NULL,
    source_doc_id   BIGINT        NOT NULL,
    transfer_group_id VARCHAR(32) NULL,
    status          VARCHAR(16)   NOT NULL DEFAULT 'RECORDED',
    remark          VARCHAR(500)  NULL,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tst_fund_transaction_no (transaction_no),
    -- 数据库级幂等：同一来源单据在同一账户同方向只允许一条有效流水
    UNIQUE KEY uk_tst_fund_txn_source (source_doc_type, source_doc_id, account_id, direction),
    KEY idx_tst_fund_txn_account_date (account_id, trade_date),
    KEY idx_tst_fund_txn_group (transfer_group_id),
    CONSTRAINT fk_tst_fund_txn_account FOREIGN KEY (account_id) REFERENCES tst_fund_account (id),
    CONSTRAINT chk_tst_fund_txn_direction CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT chk_tst_fund_txn_amount CHECK (amount > 0),
    CONSTRAINT chk_tst_fund_txn_status CHECK (status IN ('RECORDED', 'VOIDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 股东出资（资本投入；不计营业收入） ==========
CREATE TABLE tst_shareholder_contribution (
    id               BIGINT        NOT NULL AUTO_INCREMENT,
    doc_no           VARCHAR(32)   NOT NULL,
    shareholder_id   BIGINT        NOT NULL,
    contribution_date DATE         NOT NULL,
    account_id       BIGINT        NOT NULL,
    amount           DECIMAL(18,2) NOT NULL,
    remark           VARCHAR(500)  NULL,
    status           VARCHAR(16)   NOT NULL DEFAULT 'CONFIRMED',
    void_record_id   BIGINT        NULL,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by       VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tst_contrib_doc_no (doc_no),
    KEY idx_tst_contrib_date (contribution_date),
    CONSTRAINT fk_tst_contrib_shareholder FOREIGN KEY (shareholder_id) REFERENCES mst_shareholder (id),
    CONSTRAINT fk_tst_contrib_account FOREIGN KEY (account_id) REFERENCES tst_fund_account (id),
    CONSTRAINT chk_tst_contrib_amount CHECK (amount > 0),
    CONSTRAINT chk_tst_contrib_status CHECK (status IN ('CONFIRMED', 'VOIDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 日常支出（已实际支付；资金流出；≠会计费用） ==========
CREATE TABLE tst_expense (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    doc_no         VARCHAR(32)   NOT NULL,
    category       VARCHAR(32)   NOT NULL,
    content        VARCHAR(255)  NOT NULL,
    biz_month      VARCHAR(7)    NULL,
    pay_date       DATE          NOT NULL,
    account_id     BIGINT        NOT NULL,
    amount         DECIMAL(18,2) NOT NULL,
    payee          VARCHAR(128)  NULL,
    employee_name  VARCHAR(64)   NULL,
    salary_month   VARCHAR(7)    NULL,
    attachment_ref VARCHAR(255)  NULL,
    remark         VARCHAR(500)  NULL,
    status         VARCHAR(16)   NOT NULL DEFAULT 'CONFIRMED',
    void_record_id BIGINT        NULL,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tst_expense_doc_no (doc_no),
    KEY idx_tst_expense_date (pay_date),
    KEY idx_tst_expense_category (category),
    CONSTRAINT fk_tst_expense_account FOREIGN KEY (account_id) REFERENCES tst_fund_account (id),
    CONSTRAINT chk_tst_expense_amount CHECK (amount > 0),
    CONSTRAINT chk_tst_expense_status CHECK (status IN ('CONFIRMED', 'VOIDED')),
    CONSTRAINT chk_tst_expense_category CHECK (category IN (
        'PURCHASE', 'SALARY', 'ELECTRICITY', 'WATER', 'INTERNET', 'RENT',
        'SUPPLIES', 'REPAIR', 'TRANSPORT', 'OTHER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 内部转账（成对流水；整体净变化为零） ==========
CREATE TABLE tst_transfer (
    id               BIGINT        NOT NULL AUTO_INCREMENT,
    doc_no           VARCHAR(32)   NOT NULL,
    transfer_date    DATE          NOT NULL,
    from_account_id  BIGINT        NOT NULL,
    to_account_id    BIGINT        NOT NULL,
    amount           DECIMAL(18,2) NOT NULL,
    remark           VARCHAR(500)  NULL,
    status           VARCHAR(16)   NOT NULL DEFAULT 'CONFIRMED',
    void_record_id   BIGINT        NULL,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by       VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tst_transfer_doc_no (doc_no),
    KEY idx_tst_transfer_date (transfer_date),
    CONSTRAINT fk_tst_transfer_from FOREIGN KEY (from_account_id) REFERENCES tst_fund_account (id),
    CONSTRAINT fk_tst_transfer_to FOREIGN KEY (to_account_id) REFERENCES tst_fund_account (id),
    CONSTRAINT chk_tst_transfer_amount CHECK (amount > 0),
    CONSTRAINT chk_tst_transfer_accounts CHECK (from_account_id <> to_account_id),
    CONSTRAINT chk_tst_transfer_status CHECK (status IN ('CONFIRMED', 'VOIDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 撤销记录（保留原单据 + 反向流水纠正余额） ==========
CREATE TABLE tst_void_record (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    void_no             VARCHAR(32)  NOT NULL,
    target_doc_type     VARCHAR(32)  NOT NULL,
    target_doc_id       BIGINT       NOT NULL,
    void_date           DATE         NOT NULL,
    reason              VARCHAR(500) NULL,
    reverse_transaction_id BIGINT    NOT NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          VARCHAR(64)  NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tst_void_no (void_no),
    -- 数据库级防重复撤销
    UNIQUE KEY uk_tst_void_target (target_doc_type, target_doc_id),
    CONSTRAINT fk_tst_void_reverse_txn FOREIGN KEY (reverse_transaction_id) REFERENCES tst_fund_transaction (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
