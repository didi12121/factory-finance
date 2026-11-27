package com.factoryfinance.modules.masterdata.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.masterdata.domain.Customer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * mst_customer 数据访问。customer_no 唯一（uk_mst_customer_no）。
 */
@Mapper
public interface CustomerMapper extends BaseMapper<Customer> {

    /**
     * 当前客户编号最大序号（CUS- 后数字部分）；无数据返回 NULL。
     * 下一编号 = max + 1，格式 CUS-%04d。
     */
    @Select("SELECT MAX(CAST(SUBSTRING(customer_no, 5) AS UNSIGNED)) FROM mst_customer WHERE customer_no LIKE 'CUS-%'")
    Integer selectMaxSequence();
}
