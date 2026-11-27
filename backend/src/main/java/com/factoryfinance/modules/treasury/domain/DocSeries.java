package com.factoryfinance.modules.treasury.domain;

/**
 * 单据编号确定性序列：前缀 + YYYYMM + 4 位序号（如 CZ-202611-0001）。
 * 编号一经生成不可变（ACCOUNTING_RULES 6.6）；数据库唯一键为幂等最终防线。
 */
public enum DocSeries {

    /** 股东出资 */
    CONTRIBUTION("CZ"),
    /** 日常支出 */
    EXPENSE("ZC"),
    /** 内部转账 */
    TRANSFER("ZZ"),
    /** 撤销 */
    VOID("VN");

    private final String prefix;

    DocSeries(String prefix) {
        this.prefix = prefix;
    }

    public String prefix() {
        return prefix;
    }
}
