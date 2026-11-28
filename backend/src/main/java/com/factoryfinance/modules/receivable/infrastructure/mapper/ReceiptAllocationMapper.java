package com.factoryfinance.modules.receivable.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.receivable.domain.ReceiptAllocation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.util.List;

/**
 * 回款核销明细 Mapper（ACTIVE 为有效核销；REVERSED 已被撤销收款冲回）。
 */
@Mapper
public interface ReceiptAllocationMapper extends BaseMapper<ReceiptAllocation> {

    /** 单张应收单的核销明细（含已撤销，按核销顺序，供详情追溯） */
    @Select("SELECT * FROM rcv_receipt_allocation WHERE receivable_id = #{receivableId} ORDER BY id")
    List<ReceiptAllocation> selectByReceivable(@Param("receivableId") Long receivableId);

    /** 单张收款单的核销明细 */
    @Select("SELECT * FROM rcv_receipt_allocation WHERE receipt_id = #{receiptId} ORDER BY id")
    List<ReceiptAllocation> selectByReceipt(@Param("receiptId") Long receiptId);

    /** 批量收款单的核销明细（列表派生口径） */
    @Select("""
            <script>
            SELECT * FROM rcv_receipt_allocation WHERE receipt_id IN
            <foreach item="id" collection="receiptIds" open="(" separator="," close=")">#{id}</foreach>
            ORDER BY id
            </script>
            """)
    List<ReceiptAllocation> selectByReceipts(@Param("receiptIds") List<Long> receiptIds);

    /** 批量应收单有效核销合计（列表派生口径） */
    @Select("""
            <script>
            SELECT receivable_id AS receivableId, COALESCE(SUM(allocation_amount), 0) AS allocated
            FROM rcv_receipt_allocation
            WHERE status = 'ACTIVE' AND receivable_id IN
            <foreach item="id" collection="receivableIds" open="(" separator="," close=")">#{id}</foreach>
            GROUP BY receivable_id
            </script>
            """)
    List<ReceivableAllocated> selectActiveSums(@Param("receivableIds") List<Long> receivableIds);

    /** 应收单有效核销合计（单笔） */
    @Select("SELECT COALESCE(SUM(allocation_amount), 0) FROM rcv_receipt_allocation "
            + "WHERE receivable_id = #{receivableId} AND status = 'ACTIVE'")
    BigDecimal selectActiveSum(@Param("receivableId") Long receivableId);

    /** 应收单有效核销合计（行投影） */
    record ReceivableAllocated(Long receivableId, BigDecimal allocated) {
    }
}
