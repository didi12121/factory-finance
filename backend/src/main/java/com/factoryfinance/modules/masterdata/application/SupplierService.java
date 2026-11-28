package com.factoryfinance.modules.masterdata.application;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageQuery;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.modules.masterdata.api.SupplierDirectoryApi;
import com.factoryfinance.modules.masterdata.api.dto.SupplierCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.SupplierResponse;
import com.factoryfinance.modules.masterdata.api.dto.SupplierUpdateRequest;
import com.factoryfinance.modules.masterdata.domain.MasterdataConstants;
import com.factoryfinance.modules.masterdata.domain.Supplier;
import com.factoryfinance.modules.masterdata.infrastructure.persistence.SupplierMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 供应商应用服务（Phase 2 最小可用主数据）。
 *
 * <p>编号 SUP-0001 递增（服务端生成，唯一且不可变）；不提供删除，
 * 被应付单据引用过的供应商以停用保留。</p>
 */
@Service
public class SupplierService implements SupplierDirectoryApi {

    private static final int GENERATE_RETRY_LIMIT = 3;

    private final SupplierMapper supplierMapper;

    public SupplierService(SupplierMapper supplierMapper) {
        this.supplierMapper = supplierMapper;
    }

    /** 新增供应商（缺省自动生成 SUP-0001 递增编号） */
    @Transactional
    public SupplierResponse create(SupplierCreateRequest request) {
        String explicitNo = MasterdataConstants.trimToNull(request.supplierNo());
        if (explicitNo != null) {
            Supplier supplier = buildSupplier(explicitNo, request);
            insertOrConflict(supplier);
            return toResponse(supplier);
        }
        DuplicateKeyException lastConflict = null;
        for (int attempt = 0; attempt < GENERATE_RETRY_LIMIT; attempt++) {
            Supplier supplier = buildSupplier(nextSupplierNo(), request);
            try {
                supplierMapper.insert(supplier);
                return toResponse(supplier);
            } catch (DuplicateKeyException ex) {
                lastConflict = ex;
            }
        }
        throw BusinessException.conflict("供应商编号生成冲突，请重试: "
                + (lastConflict == null ? "" : lastConflict.getMessage()));
    }

    /** 供应商列表（分页 + 关键字/状态筛选） */
    public PageResult<SupplierResponse> list(String keyword, String status, PageQuery query) {
        String normalizedStatus = validateStatus(status);
        String normalizedKeyword = MasterdataConstants.trimToNull(keyword);
        Page<Supplier> page = new Page<>(query.normalizedPage(), query.normalizedSize());
        LambdaQueryWrapper<Supplier> wrapper = new LambdaQueryWrapper<Supplier>()
                .eq(normalizedStatus != null, Supplier::getStatus, normalizedStatus)
                .and(normalizedKeyword != null, w -> w
                        .like(Supplier::getName, normalizedKeyword)
                        .or().like(Supplier::getSupplierNo, normalizedKeyword)
                        .or().like(Supplier::getContact, normalizedKeyword))
                .orderByDesc(Supplier::getId);
        Page<Supplier> result = supplierMapper.selectPage(page, wrapper);
        return PageResult.of(result.getRecords().stream().map(this::toResponse).toList(),
                result.getTotal(), query.normalizedPage(), query.normalizedSize());
    }

    /** 更新供应商（含启停用；编号不可变） */
    @Transactional
    public SupplierResponse update(Long id, SupplierUpdateRequest request) {
        Supplier supplier = supplierMapper.selectById(id);
        if (supplier == null) {
            throw BusinessException.notFound("供应商");
        }
        if (request.name() != null) {
            supplier.setName(MasterdataConstants.trimToNull(request.name()));
        }
        if (request.contact() != null) {
            supplier.setContact(MasterdataConstants.trimToNull(request.contact()));
        }
        if (request.phone() != null) {
            supplier.setPhone(MasterdataConstants.trimToNull(request.phone()));
        }
        if (request.remark() != null) {
            supplier.setRemark(MasterdataConstants.trimToNull(request.remark()));
        }
        if (request.status() != null) {
            supplier.setStatus(request.status());
        }
        supplierMapper.updateById(supplier);
        return toResponse(supplier);
    }

    @Override
    public Optional<SupplierInfo> findSupplier(long supplierId) {
        Supplier supplier = supplierMapper.selectById(supplierId);
        if (supplier == null) {
            return Optional.empty();
        }
        return Optional.of(new SupplierInfo(supplier.getId(), supplier.getSupplierNo(), supplier.getName(),
                MasterdataConstants.STATUS_ENABLED.equals(supplier.getStatus())));
    }

    @Override
    public Optional<SupplierInfo> findSupplierByName(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        List<Supplier> matches = supplierMapper.selectList(new QueryWrapper<Supplier>()
                .eq("name", name.trim())
                .last("LIMIT 2"));
        return matches.size() == 1
                ? Optional.of(new SupplierInfo(matches.get(0).getId(), matches.get(0).getSupplierNo(),
                        matches.get(0).getName(),
                        MasterdataConstants.STATUS_ENABLED.equals(matches.get(0).getStatus())))
                : Optional.empty();
    }

    @Override
    public Map<Long, String> supplierNames(Collection<Long> supplierIds) {
        Map<Long, String> result = new HashMap<>();
        if (supplierIds == null || supplierIds.isEmpty()) {
            return result;
        }
        supplierMapper.selectList(new QueryWrapper<Supplier>().in("id", supplierIds))
                .forEach(supplier -> result.put(supplier.getId(), supplier.getName()));
        return result;
    }

    private Supplier buildSupplier(String supplierNo, SupplierCreateRequest request) {
        Supplier supplier = new Supplier();
        supplier.setSupplierNo(supplierNo);
        supplier.setName(MasterdataConstants.trimToNull(request.name()));
        supplier.setContact(MasterdataConstants.trimToNull(request.contact()));
        supplier.setPhone(MasterdataConstants.trimToNull(request.phone()));
        supplier.setRemark(MasterdataConstants.trimToNull(request.remark()));
        supplier.setStatus(MasterdataConstants.STATUS_ENABLED);
        return supplier;
    }

    private void insertOrConflict(Supplier supplier) {
        try {
            supplierMapper.insert(supplier);
        } catch (DuplicateKeyException ex) {
            throw BusinessException.conflict("供应商编号已存在: " + supplier.getSupplierNo());
        }
    }

    private String nextSupplierNo() {
        Long max = supplierMapper.selectMaxSequence();
        long next = (max == null ? 0L : max) + 1;
        return String.format("%s%04d", MasterdataConstants.SUPPLIER_NO_PREFIX, next);
    }

    private String validateStatus(String status) {
        String normalized = MasterdataConstants.trimToNull(status);
        if (normalized == null) {
            return null;
        }
        if (!MasterdataConstants.STATUS_ENABLED.equals(normalized)
                && !MasterdataConstants.STATUS_DISABLED.equals(normalized)) {
            Map<String, String> fieldErrors = new LinkedHashMap<>();
            fieldErrors.put("status", "状态只能是 ENABLED 或 DISABLED");
            throw com.factoryfinance.common.validation.ValidationRules.invalidFields(fieldErrors);
        }
        return normalized;
    }

    private SupplierResponse toResponse(Supplier supplier) {
        return new SupplierResponse(supplier.getId(), supplier.getSupplierNo(), supplier.getName(),
                supplier.getContact(), supplier.getPhone(), supplier.getRemark(), supplier.getStatus(),
                MasterdataConstants.formatDateTime(supplier.getCreatedAt()),
                MasterdataConstants.formatDateTime(supplier.getUpdatedAt()));
    }
}
