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

    /** 该采购支出当前关联的有效应付单（无则 null）；锁行用于并发重复关联校验 */
    @Select("SELECT * FROM pay_payable WHERE funded_expense_id = #{expenseId} AND status = 'CONFIRMED' FOR UPDATE")
    Payable selectActiveByFundedExpense(@Param("expenseId") Long expenseId);

    /** 已被有效应付单引用的采购支出 id（关联候选列表排除用） */
    @Select("SELECT funded_expense_id FROM pay_payable "
            + "WHERE status = 'CONFIRMED' AND funded_expense_id IS NOT NULL")
    List<Long> selectLinkedExpenseIds();

    /** 已确认应付单 + 有效付款核销合计（应付余额统计，全部读取真实数据库） */
    @Select("""
            SELECT p.id AS id, p.supplier_id AS supplierId, p.amount AS amount, p.due_date AS dueDate,
                   p.funded_expense_id AS fundedExpenseId,
                   COALESCE((SELECT SUM(a.allocation_amount) FROM pay_payment_allocation a
                             WHERE a.payable_id = p.id AND a.status = 'ACTIVE'), 0) AS allocated
            FROM pay_payable p
            WHERE p.status = 'CONFIRMED'
            """)
    List<OutstandingRow> selectOutstandingRows();

    /** 应付余额统计行 */
    record OutstandingRow(Long id, Long supplierId, BigDecimal amount, java.time.LocalDate dueDate,
                          Long fundedExpenseId, BigDecimal allocated) {
    }
}
