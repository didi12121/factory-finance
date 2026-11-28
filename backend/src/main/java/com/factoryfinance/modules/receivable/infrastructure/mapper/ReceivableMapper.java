package com.factoryfinance.modules.receivable.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.receivable.domain.Receivable;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;

/**
 * 应收单 Mapper。
 */
@Mapper
public interface ReceivableMapper extends BaseMapper<Receivable> {

    /** 当前最大序号（仅统计确定性序列；数值化比较避免字典序误判） */
    @Select("SELECT MAX(CAST(SUBSTRING(statement_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) "
            + "FROM rcv_receivable WHERE statement_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(statement_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) "
            + "FROM rcv_receivable WHERE statement_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);

    /** 并发核销防护：锁定应收单行后读取有效核销合计 */
    @Select("SELECT * FROM rcv_receivable WHERE id = #{id} FOR UPDATE")
    Receivable selectByIdForUpdate(@Param("id") Long id);

    /** 有效核销合计（ACTIVE 明细；REVERSED 不计） */
    @Select("SELECT COALESCE(SUM(allocation_amount), 0) FROM rcv_receipt_allocation "
            + "WHERE receivable_id = #{receivableId} AND status = 'ACTIVE'")
    BigDecimal selectActiveAllocatedSum(@Param("receivableId") Long receivableId);

    /** 已确认应收单 + 有效核销合计（应收/逾期余额统计，全部读取真实数据库） */
    @Select("""
            SELECT r.id AS id, r.customer_id AS customerId, r.original_amount AS originalAmount,
                   r.due_date AS dueDate,
                   COALESCE((SELECT SUM(a.allocation_amount) FROM rcv_receipt_allocation a
                             WHERE a.receivable_id = r.id AND a.status = 'ACTIVE'), 0) AS allocated
            FROM rcv_receivable r
            WHERE r.status = 'CONFIRMED'
            """)
    java.util.List<OutstandingRow> selectOutstandingRows();

    /** 应收余额统计行 */
    record OutstandingRow(Long id, Long customerId, BigDecimal originalAmount,
                          java.time.LocalDate dueDate, BigDecimal allocated) {
    }
}
