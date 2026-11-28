package com.factoryfinance.modules.receivable.api.dto;

import java.util.List;

/**
 * 核销预览结果（不落库）：Σ核销 ≤ 实际收款；本阶段要求全额核销。
 */
public record AllocationPreviewView(
        List<ReceiptAllocationRequest> allocations,
        String totalAllocated,
        String unallocated,
        List<BusinessErrorView> errors) {

    /** 字段/业务错误（与统一错误模型对齐） */
    public record BusinessErrorView(String code, String message) {
    }
}
