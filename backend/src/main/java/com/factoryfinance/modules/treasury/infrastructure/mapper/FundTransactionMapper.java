package com.factoryfinance.modules.treasury.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 资金流水 Mapper。
 */
@Mapper
public interface FundTransactionMapper extends BaseMapper<FundTransaction> {

    /** 每账户净流量（IN − OUT，全部 RECORDED 流水），余额重算用 */
    record AccountNet(Long accountId, BigDecimal net) {
    }

    /** 按日外部收付聚合（趋势图） */
    record DailyFlow(LocalDate tradeDate,
                     BigDecimal inflow,
                     BigDecimal outflow,
                     BigDecimal correctionIn,
                     BigDecimal correctionOut) {
    }

    /** 期间外部收付合计 */
    record ExternalFlow(BigDecimal inflow, BigDecimal outflow) {
    }

    @Select("""
            SELECT account_id AS accountId,
                   COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0) AS net
            FROM tst_fund_transaction
            WHERE status = 'RECORDED'
            GROUP BY account_id
            """)
    List<AccountNet> selectNetByAccount();

    /**
     * 期间外部收付（排除内部转账 TRANSFER 与撤销反向 VOID；股东出资属于外部流入）。
     */
    @Select("""
            SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0) AS inflow,
                   COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0) AS outflow
            FROM tst_fund_transaction
            WHERE trade_date BETWEEN #{from} AND #{to}
              AND source_doc_type NOT IN ('TRANSFER', 'VOID')
            """)
    ExternalFlow selectExternalFlow(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * 按日收付趋势：外部收付（不含内部转账）；VOID 反向按撤销日（= trade_date）展示为更正。
     */
    @Select("""
            SELECT trade_date AS tradeDate,
                   COALESCE(SUM(CASE WHEN source_doc_type NOT IN ('TRANSFER', 'VOID') AND direction = 'IN'
                                THEN amount ELSE 0 END), 0) AS inflow,
                   COALESCE(SUM(CASE WHEN source_doc_type NOT IN ('TRANSFER', 'VOID') AND direction = 'OUT'
                                THEN amount ELSE 0 END), 0) AS outflow,
                   COALESCE(SUM(CASE WHEN source_doc_type = 'VOID' AND direction = 'IN'
                                THEN amount ELSE 0 END), 0) AS correctionIn,
                   COALESCE(SUM(CASE WHEN source_doc_type = 'VOID' AND direction = 'OUT'
                                THEN amount ELSE 0 END), 0) AS correctionOut
            FROM tst_fund_transaction
            WHERE trade_date BETWEEN #{from} AND #{to}
            GROUP BY trade_date
            """)
    List<DailyFlow> selectDailyFlow(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
