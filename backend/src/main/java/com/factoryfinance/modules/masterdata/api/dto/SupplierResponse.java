package com.factoryfinance.modules.masterdata.api.dto;

/**
 * 供应商视图。
 */
public record SupplierResponse(
        Long id,
        String supplierNo,
        String name,
        String contact,
        String phone,
        String remark,
        String status,
        String createdAt,
        String updatedAt) {
}
