package com.factoryfinance.modules.receivable.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.receivable.domain.Receipt;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;

/**
 * 收款单 Mapper。
 */
@Mapper
public interface ReceiptMapper extends BaseMapper<Receipt> {

    @Select("SELECT MAX(CAST(SUBSTRING(receipt_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) "
            + "FROM rcv_receipt WHERE receipt_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(receipt_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) "
            + "FROM rcv_receipt WHERE receipt_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);

    @Select("SELECT * FROM rcv_receipt WHERE id = #{id} FOR UPDATE")
    Receipt selectByIdForUpdate(@Param("id") Long id);

    /** 期间实际回款合计（CONFIRMED 收款单；已撤销不计） */
    @Select("SELECT COALESCE(SUM(actual_amount), 0) FROM rcv_receipt "
            + "WHERE status = 'CONFIRMED' AND receipt_date BETWEEN #{from} AND #{to}")
    BigDecimal selectConfirmedSum(@Param("from") java.time.LocalDate from,
                                  @Param("to") java.time.LocalDate to);
}
