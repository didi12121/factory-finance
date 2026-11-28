package com.factoryfinance.modules.treasury.api;

import java.util.Optional;

/**
 * 资金类业务单据撤销前置守卫（SPI，模块间协作：api 包接口）。
 *
 * <p>资金模块在撤销业务单据前收集全部守卫 Bean；任一守卫返回原因即拒绝撤销。
 * 用于表达「该资金单据仍被其它模块的业务事实引用」这一跨模块约束，
 * 使 treasury 不反向依赖 receivable / payable 模块。</p>
 */
public interface FundDocumentVoidGuard {

    /**
     * 判断是否禁止撤销。
     *
     * @param docType 单据类型（如 EXPENSE / RECEIPT / PAYMENT）
     * @param docId   单据主键
     * @return 禁止原因（面向用户，含关联单据编号）；允许撤销时返回 {@link Optional#empty()}
     */
    Optional<String> blockReason(String docType, long docId);
}
