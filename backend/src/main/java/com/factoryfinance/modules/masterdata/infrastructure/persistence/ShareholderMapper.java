package com.factoryfinance.modules.masterdata.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.masterdata.domain.Shareholder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * mst_shareholder 数据访问。shareholder_no 唯一（uk_mst_shareholder_no）。
 */
@Mapper
public interface ShareholderMapper extends BaseMapper<Shareholder> {

    /**
     * 当前股东编号最大序号（SH- 后数字部分）；无数据返回 NULL。
     * 下一编号 = max + 1，格式 SH-%04d。
     */
    @Select("SELECT MAX(CAST(SUBSTRING(shareholder_no, 4) AS UNSIGNED)) FROM mst_shareholder WHERE shareholder_no LIKE 'SH-%'")
    Long selectMaxSequence();
}
