package com.factoryfinance.modules.treasury.application;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 财务金额展示与传输格式化（十进制字符串）。
 * 存储与计算一律 BigDecimal，禁止 float/double；传输一律十进制字符串。
 */
public final class Money {

    private Money() {
    }

    /** 金额转十进制字符串（DECIMAL(18,2) 语义输出） */
    public static String str(BigDecimal value) {
        if (value == null) {
            return "0.00";
        }
        return value.scale() <= 2 ? value.setScale(2).toPlainString() : value.toPlainString();
    }

    /** 0 值（合计缺省） */
    public static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
    }
}
