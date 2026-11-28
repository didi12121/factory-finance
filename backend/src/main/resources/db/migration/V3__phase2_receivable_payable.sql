-- Phase 2 —— 正式应收应付、回款/付款核销 数据库结构（MySQL 8）
-- 财务规则（docs/ACCOUNTING_RULES.md）：
--   金额 DECIMAL(18,2) 恒 > 0；应收/应付余额 = 原始金额 − Σ有效核销（派生，不冗余存储）；
--   确认应收单/应付单不产生资金流水；确认收款/付款才产生资金流水（一笔收付一条流水）；
--   核销明细不产生资金流水；禁止物理删除已确认财务数据；
--   撤销通过可追溯撤销记录 + 反向流水（收付款）或纯状态撤销（应收/应付）恢复余额。

-- ========== 供应商（主数据，最小可用） ==========
CREATE TABLE mst_supplier (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    supplier_no  VARCHAR(32)  NOT NULL,
    name         VARCHAR(128) NOT NULL,
    contact      VARCHAR(128) NULL,
    phone        VARCHAR(32)  NULL,
    remark       VARCHAR(500) NULL,
    status       VARCHAR(16)  NOT NULL DEFAULT 'ENABLED',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(64)  NOT NULL DEFAULT 'system',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by   VARCHAR(64)  NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_mst_supplier_no (supplier_no),
    CONSTRAINT chk_mst_supplier_status CHECK (status IN ('ENABLED', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 请求幂等（独立于业务单据编号） ==========
-- 语义：同 (operation, idem_key) 只允许一条记录；
--   request_hash 相同 → 返回已生成单据（不重复生成单据与流水）；
--   request_hash 不同 → 拒绝（409 同键异参）。
-- doc_type/doc_id 在业务单据落库后回填（PENDING/0 为占位，事务失败即整行回滚）。
CREATE TABLE sys_request_idempotency (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    operation    VARCHAR(48) NOT NULL,
    idem_key     VARCHAR(96) NOT NULL,
    request_hash CHAR(64)    NOT NULL,
    doc_type     VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    doc_id       BIGINT      NOT NULL DEFAULT 0,
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(64) NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_sys_request_idempotency (operation, idem_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 应收单（债权；确认不产生资金流水） ==========
CREATE TABLE rcv_receivable (
    id               BIGINT        NOT NULL AUTO_INCREMENT,
    statement_no     VARCHAR(32)   NOT NULL,
    customer_id      BIGINT        NOT NULL,
    accounting_month VARCHAR(7)    NOT NULL,
    statement_date   DATE          NOT NULL,
    due_date         DATE          NULL,
    original_amount  DECIMAL(18,2) NOT NULL,
    remark           VARCHAR(500)  NULL,
    status           VARCHAR(16)   NOT NULL DEFAULT 'CONFIRMED',
    void_record_id   BIGINT        NULL,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by       VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_rcv_receivable_no (statement_no),
    KEY idx_rcv_receivable_customer (customer_id, statement_date),
    KEY idx_rcv_receivable_month (accounting_month),
    CONSTRAINT fk_rcv_receivable_customer FOREIGN KEY (customer_id) REFERENCES mst_customer (id),
    CONSTRAINT chk_rcv_receivable_amount CHECK (original_amount > 0),
    CONSTRAINT chk_rcv_receivable_status CHECK (status IN ('CONFIRMED', 'VOIDED')),
    CONSTRAINT chk_rcv_receivable_due CHECK (due_date IS NULL OR due_date >= statement_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 收款单（资金流入事实；一笔收款只对应一条资金流水） ==========
CREATE TABLE rcv_receipt (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    receipt_no          VARCHAR(32)   NOT NULL,
    customer_id         BIGINT        NOT NULL,
    receipt_date        DATE          NOT NULL,
    account_id          BIGINT        NOT NULL,
    actual_amount       DECIMAL(18,2) NOT NULL,
    -- 先落收款单再落流水，同事务回填；UNIQUE 保证"一笔收款一条流水"
    fund_transaction_id BIGINT        NULL,
    external_ref        VARCHAR(128)  NULL,
    remark              VARCHAR(500)  NULL,
    status              VARCHAR(16)   NOT NULL DEFAULT 'CONFIRMED',
    void_record_id      BIGINT        NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_rcv_receipt_no (receipt_no),
    UNIQUE KEY uk_rcv_receipt_txn (fund_transaction_id),
    KEY idx_rcv_receipt_customer (customer_id, receipt_date),
    CONSTRAINT fk_rcv_receipt_customer FOREIGN KEY (customer_id) REFERENCES mst_customer (id),
    CONSTRAINT fk_rcv_receipt_account FOREIGN KEY (account_id) REFERENCES tst_fund_account (id),
    CONSTRAINT fk_rcv_receipt_txn FOREIGN KEY (fund_transaction_id) REFERENCES tst_fund_transaction (id),
    CONSTRAINT chk_rcv_receipt_amount CHECK (actual_amount > 0),
    CONSTRAINT chk_rcv_receipt_status CHECK (status IN ('CONFIRMED', 'VOIDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 回款核销明细（收款单 ↔ 应收单；不产生资金流水） ==========
CREATE TABLE rcv_receipt_allocation (
    id                     BIGINT        NOT NULL AUTO_INCREMENT,
    receipt_id             BIGINT        NOT NULL,
    receivable_id          BIGINT        NOT NULL,
    allocation_amount      DECIMAL(18,2) NOT NULL,
    status                 VARCHAR(16)   NOT NULL DEFAULT 'ACTIVE',
    reversed_void_record_id BIGINT       NULL,
    allocated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by             VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    -- 同一收款单对同一应收单只允许一条有效核销行（并发不超核销的最终防线）
    UNIQUE KEY uk_rcv_alloc_pair (receipt_id, receivable_id),
    KEY idx_rcv_alloc_receivable (receivable_id, status),
    CONSTRAINT fk_rcv_alloc_receipt FOREIGN KEY (receipt_id) REFERENCES rcv_receipt (id),
    CONSTRAINT fk_rcv_alloc_receivable FOREIGN KEY (receivable_id) REFERENCES rcv_receivable (id),
    CONSTRAINT chk_rcv_alloc_amount CHECK (allocation_amount > 0),
    CONSTRAINT chk_rcv_alloc_status CHECK (status IN ('ACTIVE', 'REVERSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 应付单（债务；确认不产生资金流水） ==========
CREATE TABLE pay_payable (
    id                 BIGINT        NOT NULL AUTO_INCREMENT,
    payable_no         VARCHAR(32)   NOT NULL,
    supplier_id        BIGINT        NOT NULL,
    biz_date           DATE          NOT NULL,
    accounting_month   VARCHAR(7)    NOT NULL,
    due_date           DATE          NULL,
    amount             DECIMAL(18,2) NOT NULL,
    content            VARCHAR(255)  NOT NULL,
    remark             VARCHAR(500)  NULL,
    -- 已由 Phase 1 直接登记的采购支出支付过：禁止再次作为应付款付款扣减资金
    funded_expense_id  BIGINT        NULL,
    status             VARCHAR(16)   NOT NULL DEFAULT 'CONFIRMED',
    void_record_id     BIGINT        NULL,
    created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by         VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_pay_payable_no (payable_no),
    KEY idx_pay_payable_supplier (supplier_id, biz_date),
    KEY idx_pay_payable_month (accounting_month),
    CONSTRAINT fk_pay_payable_supplier FOREIGN KEY (supplier_id) REFERENCES mst_supplier (id),
    CONSTRAINT chk_pay_payable_amount CHECK (amount > 0),
    CONSTRAINT chk_pay_payable_status CHECK (status IN ('CONFIRMED', 'VOIDED')),
    CONSTRAINT chk_pay_payable_due CHECK (due_date IS NULL OR due_date >= biz_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 付款单（资金流出事实；一笔付款只对应一条资金流水） ==========
CREATE TABLE pay_payment (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    payment_no          VARCHAR(32)   NOT NULL,
    supplier_id         BIGINT        NOT NULL,
    payment_date        DATE          NOT NULL,
    account_id          BIGINT        NOT NULL,
    amount              DECIMAL(18,2) NOT NULL,
    fund_transaction_id BIGINT        NULL,
    external_ref        VARCHAR(128)  NULL,
    remark              VARCHAR(500)  NULL,
    status              VARCHAR(16)   NOT NULL DEFAULT 'CONFIRMED',
    void_record_id      BIGINT        NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_pay_payment_no (payment_no),
    UNIQUE KEY uk_pay_payment_txn (fund_transaction_id),
    KEY idx_pay_payment_supplier (supplier_id, payment_date),
    CONSTRAINT fk_pay_payment_supplier FOREIGN KEY (supplier_id) REFERENCES mst_supplier (id),
    CONSTRAINT fk_pay_payment_account FOREIGN KEY (account_id) REFERENCES tst_fund_account (id),
    CONSTRAINT fk_pay_payment_txn FOREIGN KEY (fund_transaction_id) REFERENCES tst_fund_transaction (id),
    CONSTRAINT chk_pay_payment_amount CHECK (amount > 0),
    CONSTRAINT chk_pay_payment_status CHECK (status IN ('CONFIRMED', 'VOIDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 付款核销明细（付款单 ↔ 应付单；不产生资金流水） ==========
CREATE TABLE pay_payment_allocation (
    id                     BIGINT        NOT NULL AUTO_INCREMENT,
    payment_id             BIGINT        NOT NULL,
    payable_id             BIGINT        NOT NULL,
    allocation_amount      DECIMAL(18,2) NOT NULL,
    status                 VARCHAR(16)   NOT NULL DEFAULT 'ACTIVE',
    reversed_void_record_id BIGINT       NULL,
    allocated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by             VARCHAR(64)   NOT NULL DEFAULT 'system',
    PRIMARY KEY (id),
    UNIQUE KEY uk_pay_alloc_pair (payment_id, payable_id),
    KEY idx_pay_alloc_payable (payable_id, status),
    CONSTRAINT fk_pay_alloc_payment FOREIGN KEY (payment_id) REFERENCES pay_payment (id),
    CONSTRAINT fk_pay_alloc_payable FOREIGN KEY (payable_id) REFERENCES pay_payable (id),
    CONSTRAINT chk_pay_alloc_amount CHECK (allocation_amount > 0),
    CONSTRAINT chk_pay_alloc_status CHECK (status IN ('ACTIVE', 'REVERSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 撤销记录扩展：应收/应付撤销无资金流水 ==========
-- 原结构 reverse_transaction_id NOT NULL 仅覆盖资金类单据；应收/应付撤销无反向流水。
ALTER TABLE tst_void_record MODIFY COLUMN reverse_transaction_id BIGINT NULL;
