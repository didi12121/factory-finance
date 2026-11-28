package com.factoryfinance.modules.payable.api.dto;

import java.util.List;

/**
 * 付款核销预览结果（不落库）。
 */
public record PayableAllocationPreviewView(
        List<PayableAllocationRequest> allocations,
        String totalAllocated,
        String unallocated,
        List<BusinessErrorView> errors) {

    /** 字段/业务错误（与统一错误模型对齐） */
    public record BusinessErrorView(String code, String message) {
    }
}
