package com.factoryfinance.common.money;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 财务金额展示与传输格式化（十进制字符串）。
 *
 * <p>红线：存储与计算一律 {@link BigDecimal}，禁止 float/double；
 * 传输一律十进制字符串（DECIMAL(18,2) 语义）。</p>
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

    /** 0 值（合计缺省，标度 2） */
    public static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
    }

    /** 归一化到 DECIMAL(18,2)（用于幂等指纹与比较，不做无依据舍入） */
    public static BigDecimal canonical(BigDecimal value) {
        return value == null ? zero() : value.setScale(2, RoundingMode.UNNECESSARY);
    }
}
