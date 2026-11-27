package com.factoryfinance.modules.treasury.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.treasury.domain.ShareholderContribution;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 股东出资单 Mapper。
 */
@Mapper
public interface ShareholderContributionMapper extends BaseMapper<ShareholderContribution> {

    /** 当前最大序号（仅统计确定性序列；自定义单据编号不参与，数值化比较避免字典序误判） */
    @Select("SELECT MAX(CAST(SUBSTRING(doc_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_shareholder_contribution "
            + "WHERE doc_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(doc_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_shareholder_contribution "
            + "WHERE doc_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);

    /** 并发下读取最新已提交行（重复提交内容比对） */
    @Select("SELECT * FROM tst_shareholder_contribution WHERE doc_no = #{docNo} FOR UPDATE")
    ShareholderContribution selectByDocNoForUpdate(@Param("docNo") String docNo);

    /** 期间已确认出资合计（CONFIRMED；已撤销单据不计） */
    @Select("""
            SELECT COALESCE(SUM(amount), 0) FROM tst_shareholder_contribution
            WHERE status = 'CONFIRMED' AND contribution_date BETWEEN #{from} AND #{to}
            """)
    BigDecimal selectConfirmedSum(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
