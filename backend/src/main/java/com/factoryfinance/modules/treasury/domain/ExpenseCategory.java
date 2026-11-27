package com.factoryfinance.modules.treasury.domain;

import java.util.Optional;

/**
 * 支出分类枚举（与 V2 chk_tst_expense_category 一致）。
 * 资金支出 ≠ 会计费用（Dashboard 统计口径单独标注）。
 */
public enum ExpenseCategory {

    PURCHASE("PURCHASE"),
    SALARY("SALARY"),
    ELECTRICITY("ELECTRICITY"),
    WATER("WATER"),
    INTERNET("INTERNET"),
    RENT("RENT"),
    SUPPLIES("SUPPLIES"),
    REPAIR("REPAIR"),
    TRANSPORT("TRANSPORT"),
    OTHER("OTHER");

    private final String code;

    ExpenseCategory(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static Optional<ExpenseCategory> fromCode(String code) {
        for (ExpenseCategory category : values()) {
            if (category.code.equals(code)) {
                return Optional.of(category);
            }
        }
        return Optional.empty();
    }
}
