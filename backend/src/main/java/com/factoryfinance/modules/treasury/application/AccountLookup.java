package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.modules.treasury.domain.AccountStatus;
import com.factoryfinance.modules.treasury.domain.FundAccount;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundAccountMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/**
 * 资金账户读取与启用校验（写操作统一入口：账户不存在 → NOT_FOUND；已停用 → VALIDATION_ERROR）。
 */
@Component
public class AccountLookup {

    private final FundAccountMapper accountMapper;
    private final FundTransactionMapper transactionMapper;

    public AccountLookup(FundAccountMapper accountMapper, FundTransactionMapper transactionMapper) {
        this.accountMapper = accountMapper;
        this.transactionMapper = transactionMapper;
    }

    /** 写操作前置校验：账户必须存在且启用 */
    public FundAccount requireEnabled(Long accountId) {
        if (accountId == null) {
            throw TreasuryValidation.invalid("accountId", "资金账户 id 必填");
        }
        FundAccount account = accountMapper.selectById(accountId);
        if (account == null) {
            throw BusinessException.notFound("资金账户");
        }
        if (!AccountStatus.ENABLED.code().equals(account.getStatus())) {
            throw TreasuryValidation.invalid("accountId", "资金账户已停用，禁止收付操作");
        }
        return account;
    }

    /**
     * 资金流水写入前置校验（锁定账户行，串行化同一账户的期初修改与流水写入）：
     * 账户存在且启用；业务日期不得早于账户期初日期。
     */
    public FundAccount requireForFlow(Long accountId, LocalDate businessDate, String dateField) {
        if (accountId == null) {
            throw TreasuryValidation.invalid("accountId", "资金账户 id 必填");
        }
        FundAccount account = accountMapper.selectByIdForUpdate(accountId);
        if (account == null) {
            throw BusinessException.notFound("资金账户");
        }
        if (!AccountStatus.ENABLED.code().equals(account.getStatus())) {
            throw TreasuryValidation.invalid("accountId", "资金账户已停用，禁止收付操作");
        }
        TreasuryValidation.requireNotBeforeOpening(businessDate, account.getOpeningDate(), dateField);
        return account;
    }

    /** 锁定账户行（并发下读取最新已提交行，期初修改与流水写入互斥） */
    public FundAccount lock(Long accountId) {
        return accountId == null ? null : accountMapper.selectByIdForUpdate(accountId);
    }

    /** 读取（可停用），不存在返回 null */
    public FundAccount find(Long accountId) {
        return accountId == null ? null : accountMapper.selectById(accountId);
    }

    /** 批量 id → 账户名称（列表展示） */
    public Map<Long, String> names(Collection<Long> ids) {
        Map<Long, String> result = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return result;
        }
        accountMapper.selectList(new QueryWrapper<FundAccount>().in("id", ids))
                .forEach(a -> result.put(a.getId(), a.getName()));
        return result;
    }

    /** 账户是否存在资金流水（期初余额修改限制用） */
    public boolean hasTransactions(Long accountId) {
        return transactionMapper.selectCount(new QueryWrapper<FundTransaction>()
                .eq("account_id", accountId)) > 0;
    }
}
