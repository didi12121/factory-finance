package com.factoryfinance.modules.treasury.domain;

import java.util.Optional;

/**
 * 资金流水方向：金额恒为正，方向表达流入/流出（与 V2 chk_tst_fund_txn_direction 一致）。
 */
public enum TxnDirection {

    IN("IN"),
    OUT("OUT");

    private final String code;

    TxnDirection(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    /** 反向（撤销反向流水使用） */
    public TxnDirection opposite() {
        return this == IN ? OUT : IN;
    }

    public static Optional<TxnDirection> fromCode(String code) {
        for (TxnDirection direction : values()) {
            if (direction.code.equals(code)) {
                return Optional.of(direction);
            }
        }
        return Optional.empty();
    }
}
