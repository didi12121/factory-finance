package com.factoryfinance.modules.masterdata.api;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

/**
 * 客户目录查询端口（模块间协作：api 包接口 + DTO）。
 * 应收模块通过本端口校验客户存在/启用并解析客户名称，禁止直查 mst_customer。
 */
public interface CustomerDirectoryApi {

    /** 客户信息（id/名称/启用状态） */
    record CustomerInfo(long id, String name, boolean enabled) {
    }

    /** 按 id 查询客户 */
    Optional<CustomerInfo> findCustomer(long customerId);

    /** 批量 id → 客户名称（列表展示） */
    Map<Long, String> customerNames(Collection<Long> customerIds);
}
