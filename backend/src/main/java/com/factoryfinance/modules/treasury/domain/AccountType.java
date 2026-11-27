package com.factoryfinance.modules.treasury.domain;

import java.util.Optional;

/**
 * 资金账户类型（与 V2 chk_tst_fund_account_type 一致）。
 */
public enum AccountType {

    BANK("BANK"),
    CASH("CASH"),
    WECHAT("WECHAT"),
    ALIPAY("ALIPAY"),
    OTHER("OTHER");

    private final String code;

    AccountType(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<AccountType> fromCode(String code) {
        for (AccountType type : values()) {
            if (type.code.equals(code)) {
                return Optional.of(type);
            }
        }
        return Optional.empty();
    }
}
