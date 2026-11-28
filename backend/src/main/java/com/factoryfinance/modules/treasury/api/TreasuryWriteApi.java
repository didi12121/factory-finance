package com.factoryfinance.modules.treasury.api;

import com.factoryfinance.modules.treasury.api.dto.CreateAccountRequest;
import com.factoryfinance.modules.treasury.api.dto.CreateContributionRequest;
import com.factoryfinance.modules.treasury.api.dto.CreateExpenseRequest;

import java.util.List;
import java.util.Optional;

/**
 * 资金业务写入与账户读取端口（模块间协作：api 包接口 + DTO）。
 *
 * <p>供数据迁移（importer）与财务核对复用真实业务服务：
 * 账户创建（含期初余额）、股东出资、日常支出；账户余额一律由流水重算。</p>
 */
public interface TreasuryWriteApi {

    /** 新增资金账户（含期初余额与期初日期），返回账户主键 */
    long createAccount(CreateAccountRequest request);

    /** 确认股东出资，返回出资单主键 */
    long createContribution(CreateContributionRequest request);

    /** 确认日常支出，返回支出单主键 */
    long createExpense(CreateExpenseRequest request);

    /** 按名称查询启用资金账户 */
    Optional<AccountSummary> findAccountByName(String name);

    /** 全部资金账户余额（期初 + 有效流水重算） */
    List<AccountBalance> listAccountBalances();

    /** 账户摘要 */
    record AccountSummary(long id, String name, String status) {
    }

    /**
     * 账户余额行。
     *
     * @param openingBalance 期初余额（DECIMAL(18,2) 字符串）
     * @param balance        当前余额 = 期初 + Σ有效流入 − Σ有效流出
     */
    record AccountBalance(long id, String accountNo, String name, String openingBalance, String balance) {
    }
}
