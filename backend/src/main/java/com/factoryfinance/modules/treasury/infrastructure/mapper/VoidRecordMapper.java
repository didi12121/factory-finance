package com.factoryfinance.modules.treasury.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.treasury.domain.VoidRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 撤销记录 Mapper。
 */
@Mapper
public interface VoidRecordMapper extends BaseMapper<VoidRecord> {

    @Select("SELECT MAX(CAST(SUBSTRING(void_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_void_record "
            + "WHERE void_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(void_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_void_record "
            + "WHERE void_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);
}
