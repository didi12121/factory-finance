package com.factoryfinance.modules.treasury.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

/**
 * 资金模块对外协作端口（模块间唯一允许的协作方式：api 包接口 + DTO）。
 *
 * <p>应收 / 应付模块通过本端口写入实际资金流水、执行撤销冲销与账户校验，
 * 禁止跨模块直查直写资金流水表。</p>
 */
public interface FundFlowPort {

    /**
     * 资金流水写入前置校验：账户存在、启用、业务日期不早于账户期初日期，
     * 并锁定账户行（与期初余额修改串行化）。
     */
    AccountRef requireAccountForFlow(long accountId, LocalDate businessDate, String dateField);

    /** 写入一条资金流水（方向与金额由业务单据决定；同来源单据同账户同方向唯一） */
    long recordFlow(FlowCommand command);

    /** 批量账户 id → 账户名称（列表展示；只读） */
    java.util.Map<Long, String> accountNames(java.util.Collection<Long> accountIds);

    /** 批量业务单据的撤销记录（可追溯展示；只读） */
    java.util.Map<Long, VoidInfo> voidRecords(String targetDocType, java.util.Collection<Long> docIds);

    /** 撤销资金类单据：撤销记录 + 反向流水（同事务），返回撤销单号 */
    VoidOutcome reverseFundDocument(String targetDocType, long targetDocId, String targetDocNo,
                                    LocalDate voidDate, String reason);

    /** 撤销无资金流水的业务单据（应收/应付）：仅登记可追溯撤销记录 */
    VoidOutcome registerVoidOnly(String targetDocType, long targetDocId, String targetDocNo,
                                 LocalDate voidDate, String reason);

    /**
     * 已确认且实际支付的采购支出（Phase 1 直接登记的资金事实），
     * 用于防止同一笔采购付款在应付模块重复扣减资金。
     */
    Optional<PurchasePaymentInfo> findConfirmedPurchaseExpense(long expenseId);

    /**
     * 锁定采购支出单行（`SELECT ... FOR UPDATE`）并返回其支付信息。
     *
     * <p>采购支出关联应付单与撤销支出必须共用该锁，保证状态校验与业务写入在同一事务内串行，
     * 避免出现「已撤销支出仍关联有效已付款应付单」的结果。</p>
     */
    Optional<PurchasePaymentInfo> lockPurchaseExpense(long expenseId);

    /**
     * 已确认且实际支付的采购支出列表（按业务日期倒序，最多 500 条），
     * 供应付模块提供「关联已有采购支出」选择项。
     */
    java.util.List<PurchasePaymentInfo> listConfirmedPurchaseExpenses();

    /** 资金账户引用（展示名 + 期初日期） */
    record AccountRef(long id, String name, LocalDate openingDate) {
    }

    /** 资金流水写入命令 */
    record FlowCommand(String transactionType,
                       LocalDate tradeDate,
                       long accountId,
                       String direction,
                       BigDecimal amount,
                       String counterparty,
                       String sourceDocType,
                       long sourceDocId,
                       String transactionNo,
                       String remark) {
    }

    /** 撤销结果（撤销单主键 + 单号） */
    record VoidOutcome(long voidRecordId, String voidNo) {
    }

    /** 撤销记录（展示用） */
    record VoidInfo(long voidRecordId, String voidNo, String voidDate, String reason) {
    }

    /** 采购支出支付事实 */
    record PurchasePaymentInfo(long expenseId, String docNo, BigDecimal amount, LocalDate payDate) {
    }
}
