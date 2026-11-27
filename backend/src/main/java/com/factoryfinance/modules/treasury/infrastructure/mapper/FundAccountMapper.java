package com.factoryfinance.modules.treasury.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.treasury.domain.FundAccount;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 资金账户 Mapper。
 */
@Mapper
public interface FundAccountMapper extends BaseMapper<FundAccount> {

    /** 当前最大账户序号（仅统计确定性序列 ACC-数字；自定义编号不参与） */
    @Select("SELECT MAX(CAST(SUBSTRING(account_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_fund_account "
            + "WHERE account_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);

    @Select("SELECT MAX(CAST(SUBSTRING(account_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM tst_fund_account "
            + "WHERE account_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$') FOR UPDATE")
    Long selectMaxSeqForUpdate(@Param("prefix") String prefix);

    /** 按 id 锁定读取（并发下读取最新已提交行） */
    @Select("SELECT * FROM tst_fund_account WHERE id = #{id} FOR UPDATE")
    FundAccount selectByIdForUpdate(@Param("id") Long id);

    /** 全部账户期初余额合计（概览"当前资金余额"重算的一部分） */
    @Select("SELECT COALESCE(SUM(opening_balance), 0) FROM tst_fund_account")
    java.math.BigDecimal selectTotalOpeningBalance();
}
