package com.factoryfinance.modules.receivable.domain;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * 应收回款状态（由有效核销金额派生，禁止冗余存储）。
 *
 * <p>UNPAID：未回款（Σ有效核销 = 0）；PARTIALLY_PAID：部分回款（0 &lt; Σ &lt; 原始应收）；
 * SETTLED：已结清（Σ = 原始应收）。<b>逾期是独立属性</b>，不混入本状态。</p>
 */
public enum ReceivableStatus {

    UNPAID("UNPAID"),
    PARTIALLY_PAID("PARTIALLY_PAID"),
    SETTLED("SETTLED");

    private final String code;

    ReceivableStatus(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<ReceivableStatus> fromCode(String code) {
        for (ReceivableStatus status : values()) {
            if (status.code.equals(code)) {
                return Optional.of(status);
            }
        }
        return Optional.empty();
    }

    /** 由原始金额与有效核销合计派生回款状态 */
    public static ReceivableStatus derive(BigDecimal originalAmount, BigDecimal allocatedAmount) {
        BigDecimal allocated = allocatedAmount == null ? BigDecimal.ZERO : allocatedAmount;
        if (allocated.signum() <= 0) {
            return UNPAID;
        }
        if (originalAmount != null && allocated.compareTo(originalAmount) >= 0) {
            return SETTLED;
        }
        return PARTIALLY_PAID;
    }
}
