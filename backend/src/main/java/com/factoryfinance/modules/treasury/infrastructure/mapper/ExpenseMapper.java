package com.factoryfinance.modules.treasury.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.treasury.domain.Expense;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 支出单 Mapper。
 */
@Mapper
public interface ExpenseMapper extends BaseMapper<Expense> {

    @Select("SELECT MAX(CAST(SUBSTRING(doc_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_expense "
            + "WHERE doc_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(doc_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_expense "
            + "WHERE doc_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);

    /** 锁定支出单行（采购支出关联创建与撤销共用同一锁，串行化状态校验与写入） */
    @Select("SELECT * FROM tst_expense WHERE id = #{id} FOR UPDATE")
    Expense selectByIdForUpdate(@Param("id") Long id);

    @Select("SELECT * FROM tst_expense WHERE doc_no = #{docNo} FOR UPDATE")
    Expense selectByDocNoForUpdate(@Param("docNo") String docNo);

    /**
     * 期间实际支出合计（资金支出口径：支出单 CONFIRMED 合计；已撤销单据不计）。
     */
    @Select("""
            SELECT COALESCE(SUM(amount), 0) FROM tst_expense
            WHERE status = 'CONFIRMED' AND pay_date BETWEEN #{from} AND #{to}
            """)
    BigDecimal selectConfirmedSum(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
