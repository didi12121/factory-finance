package com.factoryfinance.modules.masterdata.api;

import com.factoryfinance.modules.masterdata.api.dto.CustomerCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.ShareholderCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.SupplierCreateRequest;

import java.util.Optional;

/**
 * 主数据写入端口（模块间协作：api 包接口 + DTO）。
 *
 * <p>供数据迁移（importer）等场景按真实业务服务创建主数据，
 * 复用既有的编号生成、唯一键校验与审计字段，禁止直写表。</p>
 */
public interface MasterdataWriteApi {

    /** 新增客户，返回客户主键 */
    long createCustomer(CustomerCreateRequest request);

    /** 新增供应商，返回供应商主键 */
    long createSupplier(SupplierCreateRequest request);

    /** 新增股东，返回股东主键 */
    long createShareholder(ShareholderCreateRequest request);

    /** 按名称查询股东主键（含停用；同名多条返回空以要求人工确认） */
    Optional<Long> findShareholderIdByName(String name);
}
