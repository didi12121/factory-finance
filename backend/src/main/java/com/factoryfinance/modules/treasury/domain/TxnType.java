package com.factoryfinance.modules.treasury.domain;

import java.util.Optional;

/**
 * 资金流水业务类型（transaction_type 与 source_doc_type 共用一套取值）。
 * VOID 为撤销生成的反向更正流水。
 */
public enum TxnType {

    CONTRIBUTION("CONTRIBUTION"),
    EXPENSE("EXPENSE"),
    TRANSFER("TRANSFER"),
    VOID("VOID");

    private final String code;

    TxnType(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<TxnType> fromCode(String code) {
        for (TxnType type : values()) {
            if (type.code.equals(code)) {
                return Optional.of(type);
            }
        }
        return Optional.empty();
    }
}
