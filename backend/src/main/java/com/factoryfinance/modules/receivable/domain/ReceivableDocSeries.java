package com.factoryfinance.modules.receivable.domain;

/**
 * 应收单据编号确定性序列：前缀 + YYYYMM + 4 位序号。
 * 编号一经生成不可变；数据库唯一键为并发最终防线。
 */
public enum ReceivableDocSeries {

    /** 加工费对账单（应收单） */
    STATEMENT("YS"),
    /** 收款单 */
    RECEIPT("SK");

    private final String prefix;

    ReceivableDocSeries(String prefix) {
        this.prefix = prefix;
    }

    public String prefix() {
        return prefix;
    }
}
