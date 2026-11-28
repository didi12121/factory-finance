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

    /** 按供应商归集的应付未付余额（只含 CONFIRMED 应付单与有效付款核销） */
    java.util.List<SupplierOutstanding> outstandingBySupplier();

    /**
     * @param supplierId   供应商主键
     * @param supplierName 供应商名称（主数据缺失时回填 id 文本）
     * @param outstanding  未付余额（应付金额 − 有效付款核销 − 支出单直接支付，恒 ≥ 0）
     */
    record SupplierOutstanding(long supplierId, String supplierName, BigDecimal outstanding) {
    }
}
