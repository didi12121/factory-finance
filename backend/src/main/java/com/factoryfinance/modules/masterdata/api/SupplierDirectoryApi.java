package com.factoryfinance.modules.masterdata.api;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

/**
 * 供应商目录查询端口（模块间协作：api 包接口 + DTO）。
 * 应付模块通过本端口校验供应商存在/启用并解析名称，禁止直查 mst_supplier。
 */
public interface SupplierDirectoryApi {

    /** 供应商信息（id/编号/名称/启用状态） */
    record SupplierInfo(long id, String supplierNo, String name, boolean enabled) {
    }

    /** 按 id 查询供应商 */
    Optional<SupplierInfo> findSupplier(long supplierId);

    /** 批量 id → 供应商名称（列表展示） */
    Map<Long, String> supplierNames(Collection<Long> supplierIds);
}
