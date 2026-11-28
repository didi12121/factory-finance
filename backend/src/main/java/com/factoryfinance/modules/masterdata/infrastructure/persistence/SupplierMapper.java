package com.factoryfinance.modules.masterdata.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.masterdata.domain.Supplier;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * mst_supplier 数据访问。supplier_no 唯一（uk_mst_supplier_no）。
 */
@Mapper
public interface SupplierMapper extends BaseMapper<Supplier> {

    /** 当前供应商编号最大序号（SUP- 后数字部分）；无数据返回 NULL */
    @Select("SELECT MAX(CAST(SUBSTRING(supplier_no, 5) AS UNSIGNED)) FROM mst_supplier WHERE supplier_no LIKE 'SUP-%'")
    Long selectMaxSequence();
}
