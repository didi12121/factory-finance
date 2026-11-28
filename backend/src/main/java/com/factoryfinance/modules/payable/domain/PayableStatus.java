package com.factoryfinance.modules.payable.domain;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * 应付款状态（由已付金额派生：Σ有效付款核销 + 已由支出单直接支付的金额）。
 * UNPAID 未付款 / PARTIALLY_PAID 部分付款 / SETTLED 已结清。
 */
public enum PayableStatus {

    UNPAID("UNPAID"),
    PARTIALLY_PAID("PARTIALLY_PAID"),
    SETTLED("SETTLED");

    private final String code;

    PayableStatus(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<PayableStatus> fromCode(String code) {
        for (PayableStatus status : values()) {
            if (status.code.equals(code)) {
                return Optional.of(status);
            }
        }
        return Optional.empty();
    }

    public static PayableStatus derive(BigDecimal amount, BigDecimal paidAmount) {
        BigDecimal paid = paidAmount == null ? BigDecimal.ZERO : paidAmount;
        if (paid.signum() <= 0) {
            return UNPAID;
        }
        if (amount != null && paid.compareTo(amount) >= 0) {
            return SETTLED;
        }
        return PARTIALLY_PAID;
    }
}
