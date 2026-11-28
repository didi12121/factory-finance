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
}
