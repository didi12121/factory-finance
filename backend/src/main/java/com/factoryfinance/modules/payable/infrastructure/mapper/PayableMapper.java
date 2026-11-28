package com.factoryfinance.modules.payable.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.payable.domain.Payable;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.util.List;

/**
 * 应付单 Mapper。
 */
@Mapper
public interface PayableMapper extends BaseMapper<Payable> {

    @Select("SELECT MAX(CAST(SUBSTRING(payable_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) "
            + "FROM pay_payable WHERE payable_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(payable_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) "
            + "FROM pay_payable WHERE payable_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);

    /** 并发付款核销防护：锁定应付单行后读取有效付款核销合计 */
    @Select("SELECT * FROM pay_payable WHERE id = #{id} FOR UPDATE")
    Payable selectByIdForUpdate(@Param("id") Long id);

    /** 有效付款核销合计（ACTIVE；REVERSED 不计） */
    @Select("SELECT COALESCE(SUM(allocation_amount), 0) FROM pay_payment_allocation "
            + "WHERE payable_id = #{payableId} AND status = 'ACTIVE'")
    BigDecimal selectActiveAllocatedSum(@Param("payableId") Long payableId);

    /** 已确认应付单 + 有效付款核销合计（应付余额统计，全部读取真实数据库） */
    @Select("""
            SELECT p.id AS id, p.amount AS amount, p.due_date AS dueDate,
                   p.funded_expense_id AS fundedExpenseId,
                   COALESCE((SELECT SUM(a.allocation_amount) FROM pay_payment_allocation a
                             WHERE a.payable_id = p.id AND a.status = 'ACTIVE'), 0) AS allocated
            FROM pay_payable p
            WHERE p.status = 'CONFIRMED'
            """)
    List<OutstandingRow> selectOutstandingRows();

    /** 应付余额统计行 */
    record OutstandingRow(Long id, BigDecimal amount, java.time.LocalDate dueDate,
                          Long fundedExpenseId, BigDecimal allocated) {
    }
}
