package com.factoryfinance.modules.treasury.application;

import java.math.BigDecimal;

/**
 * 财务金额展示与传输格式化（十进制字符串）。
 * 实现下沉至 {@link com.factoryfinance.common.money.Money}，此处保留模块内调用点。
 */
public final class Money {

    private Money() {
    }

    /** 金额转十进制字符串（DECIMAL(18,2) 语义输出） */
    public static String str(BigDecimal value) {
        return com.factoryfinance.common.money.Money.str(value);
    }

    /** 0 值（合计缺省） */
    public static BigDecimal zero() {
        return com.factoryfinance.common.money.Money.zero();
    }
}
