package com.factoryfinance.modules.masterdata.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.modules.masterdata.api.MasterdataWriteApi;
import com.factoryfinance.modules.masterdata.api.dto.CustomerCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.ShareholderCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.SupplierCreateRequest;
import com.factoryfinance.modules.masterdata.domain.Shareholder;
import com.factoryfinance.modules.masterdata.infrastructure.persistence.ShareholderMapper;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * 主数据写入端口实现：委托既有业务服务（编号生成 / 唯一键 / 审计字段一致）。
 */
@Component
public class MasterdataWriteService implements MasterdataWriteApi {

    private final CustomerService customerService;
    private final SupplierService supplierService;
    private final ShareholderService shareholderService;
    private final ShareholderMapper shareholderMapper;

    public MasterdataWriteService(CustomerService customerService,
                                  SupplierService supplierService,
                                  ShareholderService shareholderService,
                                  ShareholderMapper shareholderMapper) {
        this.customerService = customerService;
        this.supplierService = supplierService;
        this.shareholderService = shareholderService;
        this.shareholderMapper = shareholderMapper;
    }

    @Override
    public long createCustomer(CustomerCreateRequest request) {
        return customerService.create(request).id();
    }

    @Override
    public long createSupplier(SupplierCreateRequest request) {
        return supplierService.create(request).id();
    }

    @Override
    public long createShareholder(ShareholderCreateRequest request) {
        return shareholderService.create(request).id();
    }

    @Override
    public Optional<Long> findShareholderIdByName(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        List<Shareholder> matches = shareholderMapper.selectList(new QueryWrapper<Shareholder>()
                .eq("name", name.trim())
                .last("LIMIT 2"));
        return matches.size() == 1 ? Optional.of(matches.get(0).getId()) : Optional.empty();
    }
}
