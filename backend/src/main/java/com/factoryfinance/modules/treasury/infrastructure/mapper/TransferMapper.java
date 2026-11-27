package com.factoryfinance.modules.treasury.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.treasury.domain.Transfer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 内部转账单 Mapper。
 */
@Mapper
public interface TransferMapper extends BaseMapper<Transfer> {

    @Select("SELECT MAX(CAST(SUBSTRING(doc_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_transfer "
            + "WHERE doc_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(doc_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_transfer "
            + "WHERE doc_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);

    @Select("SELECT * FROM tst_transfer WHERE doc_no = #{docNo} FOR UPDATE")
    Transfer selectByDocNoForUpdate(@Param("docNo") String docNo);
}
