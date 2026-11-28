package com.factoryfinance.modules.masterdata.application;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.ErrorCode;
import com.factoryfinance.common.api.PageQuery;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.modules.masterdata.api.CustomerDirectoryApi;
import com.factoryfinance.modules.masterdata.api.dto.CustomerCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.CustomerResponse;
import com.factoryfinance.modules.masterdata.api.dto.CustomerUpdateRequest;
import com.factoryfinance.modules.masterdata.domain.Customer;
import com.factoryfinance.modules.masterdata.domain.MasterdataConstants;
import com.factoryfinance.modules.masterdata.infrastructure.persistence.CustomerMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * 客户应用服务（事务边界在 application 层）。
 *
 * <p>业务编号 CUS-0001 递增（max+1，确定性规则），唯一键为最终防线；
 * 重复编号返回 409 CONFLICT。不提供删除：被资金流水或后续业务引用的记录
 * 以停用保留（API_CONTRACT §10）。</p>
 */
@Service
public class CustomerService implements CustomerDirectoryApi {

    private static final int GENERATE_RETRY_LIMIT = 3;

    private final CustomerMapper customerMapper;

    public CustomerService(CustomerMapper customerMapper) {
        this.customerMapper = customerMapper;
    }

    /** 新增客户（缺省自动生成 CUS-0001 递增编号） */
    @Transactional
    public CustomerResponse create(CustomerCreateRequest request) {
        String explicitNo = MasterdataConstants.trimToNull(request.customerNo());
        if (explicitNo != null) {
            Customer customer = buildCustomer(explicitNo, request);
            insertOrConflict(customer);
            return toResponse(customer);
        }
        // 自动编号：并发下唯一键兜底，冲突时按新 max 重算重试
        DuplicateKeyException lastConflict = null;
        for (int attempt = 0; attempt < GENERATE_RETRY_LIMIT; attempt++) {
            Customer customer = buildCustomer(nextCustomerNo(), request);
            try {
                customerMapper.insert(customer);
                return toResponse(customer);
            } catch (DuplicateKeyException ex) {
                lastConflict = ex;
            }
        }
        throw BusinessException.conflict("客户编号生成冲突，请重试: "
                + (lastConflict == null ? "" : lastConflict.getMessage()));
    }

    /** 客户列表（分页 + 关键字/状态筛选；关键字匹配名称、编号、联系方式） */
    public PageResult<CustomerResponse> list(String keyword, String status, PageQuery query) {
        String normalizedStatus = validateStatus(status);
        String normalizedKeyword = MasterdataConstants.trimToNull(keyword);
        Page<Customer> page = new Page<>(query.normalizedPage(), query.normalizedSize());
        LambdaQueryWrapper<Customer> wrapper = new LambdaQueryWrapper<Customer>()
                .eq(normalizedStatus != null, Customer::getStatus, normalizedStatus)
                .and(normalizedKeyword != null, w -> w
                        .like(Customer::getName, normalizedKeyword)
                        .or().like(Customer::getCustomerNo, normalizedKeyword)
                        .or().like(Customer::getContact, normalizedKeyword))
                .orderByDesc(Customer::getId);
        Page<Customer> result = customerMapper.selectPage(page, wrapper);
        return PageResult.of(result.getRecords().stream().map(this::toResponse).toList(),
                result.getTotal(), query.normalizedPage(), query.normalizedSize());
    }

    /** 更新客户（含启停用；业务编号不可变） */
    @Transactional
    public CustomerResponse update(Long id, CustomerUpdateRequest request) {
        Customer customer = customerMapper.selectById(id);
        if (customer == null) {
            throw BusinessException.notFound("客户");
        }
        applyFields(customer, request.name(), request.contact(), request.remark());
        if (request.status() != null) {
            customer.setStatus(request.status());
        }
        customerMapper.updateById(customer);
        return toResponse(customer);
    }

    private Customer buildCustomer(String customerNo, CustomerCreateRequest request) {
        Customer customer = new Customer();
        customer.setCustomerNo(customerNo);
        applyFields(customer, request.name(), request.contact(), request.remark());
        customer.setStatus(MasterdataConstants.STATUS_ENABLED);
        return customer;
    }

    private void applyFields(Customer customer, String name, String contact, String remark) {
        customer.setName(MasterdataConstants.trimToNull(name));
        customer.setContact(MasterdataConstants.trimToNull(contact));
        customer.setRemark(MasterdataConstants.trimToNull(remark));
    }

    private void insertOrConflict(Customer customer) {
        try {
            customerMapper.insert(customer);
        } catch (DuplicateKeyException ex) {
            throw BusinessException.conflict("客户编号已存在: " + customer.getCustomerNo());
        }
    }

    private String nextCustomerNo() {
        Integer max = customerMapper.selectMaxSequence();
        int next = (max == null ? 0 : max) + 1;
        return String.format("%s%04d", MasterdataConstants.CUSTOMER_NO_PREFIX, next);
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
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, ErrorCode.VALIDATION_ERROR.getDefaultMessage(),
                    Map.of("fieldErrors", fieldErrors));
        }
        return normalized;
    }

    @Override
    public Optional<CustomerInfo> findCustomer(long customerId) {
        Customer customer = customerMapper.selectById(customerId);
        if (customer == null) {
            return Optional.empty();
        }
        return Optional.of(new CustomerInfo(customer.getId(), customer.getName(),
                MasterdataConstants.STATUS_ENABLED.equals(customer.getStatus())));
    }

    @Override
    public Map<Long, String> customerNames(Collection<Long> customerIds) {
        Map<Long, String> result = new HashMap<>();
        if (customerIds == null || customerIds.isEmpty()) {
            return result;
        }
        customerMapper.selectList(new QueryWrapper<Customer>().in("id", customerIds))
                .forEach(customer -> result.put(customer.getId(), customer.getName()));
        return result;
    }

    private CustomerResponse toResponse(Customer customer) {
        return new CustomerResponse(customer.getId(), customer.getCustomerNo(), customer.getName(),
                customer.getContact(), customer.getRemark(), customer.getStatus(),
                MasterdataConstants.formatDateTime(customer.getCreatedAt()),
                MasterdataConstants.formatDateTime(customer.getUpdatedAt()));
    }
}
