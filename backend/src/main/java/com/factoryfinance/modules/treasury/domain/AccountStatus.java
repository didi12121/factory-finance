package com.factoryfinance.modules.treasury.domain;

import java.util.Optional;

/**
 * 资金账户启停用状态（与 V2 chk_tst_fund_account_status 一致）。
 */
public enum AccountStatus {

    ENABLED("ENABLED"),
    DISABLED("DISABLED");

    private final String code;

    AccountStatus(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<AccountStatus> fromCode(String code) {
        for (AccountStatus status : values()) {
            if (status.code.equals(code)) {
                return Optional.of(status);
            }
        }
        return Optional.empty();
    }
}
