package com.factoryfinance.modules.payable.domain;

/**
 * 应付单据编号确定性序列：前缀 + YYYYMM + 4 位序号（YF 应付单 / FK 付款单）。
 */
public enum PayableDocSeries {

    PAYABLE("YF"),
    PAYMENT("FK");

    private final String prefix;

    PayableDocSeries(String prefix) {
        this.prefix = prefix;
    }

    public String prefix() {
        return prefix;
    }
}
