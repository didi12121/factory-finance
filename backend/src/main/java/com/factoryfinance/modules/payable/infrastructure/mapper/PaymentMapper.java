package com.factoryfinance.modules.payable.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.payable.domain.Payment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 付款单 Mapper。
 */
@Mapper
public interface PaymentMapper extends BaseMapper<Payment> {

    @Select("SELECT MAX(CAST(SUBSTRING(payment_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) "
            + "FROM pay_payment WHERE payment_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(payment_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) "
            + "FROM pay_payment WHERE payment_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);

    @Select("SELECT * FROM pay_payment WHERE id = #{id} FOR UPDATE")
    Payment selectByIdForUpdate(@Param("id") Long id);
}
