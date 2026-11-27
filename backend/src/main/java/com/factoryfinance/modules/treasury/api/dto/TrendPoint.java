package com.factoryfinance.modules.treasury.api.dto;

/**
 * 资金收付趋势（按日）：外部收付不含内部转账；撤销反向流水按撤销日展示为更正。
 */
public record TrendPoint(
        String date,
        String inflow,
        String outflow,
        String correctionIn,
        String correctionOut) {
}
