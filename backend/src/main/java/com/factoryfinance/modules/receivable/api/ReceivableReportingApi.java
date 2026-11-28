package com.factoryfinance.modules.receivable.api;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 应收对外统计端口（模块间协作：api 包接口 + DTO）。
 * 经营概览读取真实数据库的应收余额，禁止页面或其它模块直查 rcv_* 表。
 */
public interface ReceivableReportingApi {

    /** 应收余额（asOf 为逾期判定基准日，取值来自服务端业务时间） */
    ReceivableBalance receivableBalance(LocalDate asOf);

    /**
     * @param outstanding        应收余额（Σ 已确认应收单未收金额）
     * @param overdueOutstanding 逾期未收余额（dueDate &lt; asOf 且未结清）
     * @param confirmedTotal     已确认应收单原始金额合计（权责发生制收入口径，≠ 实际回款）
     */
    record ReceivableBalance(BigDecimal outstanding, BigDecimal overdueOutstanding, BigDecimal confirmedTotal) {
    }

    /** 按客户归集的应收未收余额（只含 CONFIRMED 应收单与有效核销） */
    java.util.List<CustomerOutstanding> outstandingByCustomer();

    /**
     * @param customerId   客户主键
     * @param customerName 客户名称（主数据缺失时回填 id 文本）
     * @param outstanding  未收余额（原始应收 − 有效核销，恒 ≥ 0）
     * @param originalTotal 该客户应收原始金额合计（权责发生制口径）
     */
    record CustomerOutstanding(long customerId, String customerName, BigDecimal outstanding,
                               BigDecimal originalTotal) {
    }
}
