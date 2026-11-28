package com.factoryfinance.modules.payable.api;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 应付对外统计端口（模块间协作：api 包接口 + DTO）。
 * 经营概览读取真实数据库的应付余额，禁止其它模块直查 pay_* 表。
 */
public interface PayableReportingApi {

    /** 应付余额（asOf 为逾期判定基准日） */
    PayableBalance payableBalance(LocalDate asOf);

    /**
     * @param outstanding        应付余额（Σ 已确认应付单未付金额）
     * @param overdueOutstanding 逾期未付余额（dueDate &lt; asOf 且未结清）
     */
    record PayableBalance(BigDecimal outstanding, BigDecimal overdueOutstanding) {
    }
}
