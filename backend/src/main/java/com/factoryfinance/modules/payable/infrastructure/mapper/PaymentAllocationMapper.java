package com.factoryfinance.modules.payable.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.payable.domain.PaymentAllocation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 付款核销明细 Mapper（ACTIVE 有效；REVERSED 随付款撤销冲回）。
 */
@Mapper
public interface PaymentAllocationMapper extends BaseMapper<PaymentAllocation> {

    @Select("SELECT * FROM pay_payment_allocation WHERE payment_id = #{paymentId} ORDER BY id")
    List<PaymentAllocation> selectByPayment(@Param("paymentId") Long paymentId);

    @Select("SELECT * FROM pay_payment_allocation WHERE payable_id = #{payableId} ORDER BY id")
    List<PaymentAllocation> selectByPayable(@Param("payableId") Long payableId);

    @Select("""
            <script>
            SELECT * FROM pay_payment_allocation WHERE payment_id IN
            <foreach item="id" collection="paymentIds" open="(" separator="," close=")">#{id}</foreach>
            ORDER BY id
            </script>
            """)
    List<PaymentAllocation> selectByPayments(@Param("paymentIds") List<Long> paymentIds);
}
