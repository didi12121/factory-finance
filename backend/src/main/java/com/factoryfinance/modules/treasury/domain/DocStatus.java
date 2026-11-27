package com.factoryfinance.modules.treasury.domain;

import java.util.Optional;

/**
 * 业务单据状态（与 V2 各单据表 status CHECK 一致）。
 */
public enum DocStatus {

    CONFIRMED("CONFIRMED"),
    VOIDED("VOIDED");

    private final String code;

    DocStatus(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<DocStatus> fromCode(String code) {
        for (DocStatus status : values()) {
            if (status.code.equals(code)) {
                return Optional.of(status);
            }
        }
        return Optional.empty();
    }
}
