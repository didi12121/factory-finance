package com.factoryfinance.modules.treasury.domain;

import java.util.Optional;

/**
 * 资金流水状态（与 V2 chk_tst_fund_txn_status 一致）。
 * 撤销不删除、不失效原流水：原流水与反向流水均为 RECORDED，成对净额为 0，余额重算一致。
 */
public enum TxnStatus {

    RECORDED("RECORDED"),
    VOIDED("VOIDED");

    private final String code;

    TxnStatus(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<TxnStatus> fromCode(String code) {
        for (TxnStatus status : values()) {
            if (status.code.equals(code)) {
                return Optional.of(status);
            }
        }
        return Optional.empty();
    }
}
