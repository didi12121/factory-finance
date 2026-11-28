package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.common.money.Money;
import com.factoryfinance.modules.treasury.api.TreasuryWriteApi;
import com.factoryfinance.modules.treasury.api.dto.CreateAccountRequest;
import com.factoryfinance.modules.treasury.api.dto.CreateContributionRequest;
import com.factoryfinance.modules.treasury.api.dto.CreateExpenseRequest;
import com.factoryfinance.modules.treasury.domain.AccountStatus;
import com.factoryfinance.modules.treasury.domain.FundAccount;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundAccountMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 资金写入 / 账户读取端口实现：委托既有业务服务与流水重算口径。
 */
@Component
public class TreasuryWriteService implements TreasuryWriteApi {

    private final AccountService accountService;
    private final ContributionService contributionService;
    private final ExpenseService expenseService;
    private final FundAccountMapper accountMapper;
    private final FundTransactionMapper transactionMapper;

    public TreasuryWriteService(AccountService accountService,
                                ContributionService contributionService,
                                ExpenseService expenseService,
                                FundAccountMapper accountMapper,
                                FundTransactionMapper transactionMapper) {
        this.accountService = accountService;
        this.contributionService = contributionService;
        this.expenseService = expenseService;
        this.accountMapper = accountMapper;
        this.transactionMapper = transactionMapper;
    }

    @Override
    public long createAccount(CreateAccountRequest request) {
        return accountService.create(request).id();
    }

    @Override
    public long createContribution(CreateContributionRequest request) {
        return contributionService.create(request).id();
    }

    @Override
    public long createExpense(CreateExpenseRequest request) {
        return expenseService.create(request).id();
    }

    @Override
    public Optional<AccountSummary> findAccountByName(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        List<FundAccount> matches = accountMapper.selectList(new QueryWrapper<FundAccount>()
                .eq("name", name.trim())
                .orderByAsc("id")
                .last("LIMIT 2"));
        if (matches.size() != 1) {
            return Optional.empty();
        }
        FundAccount account = matches.get(0);
        return Optional.of(new AccountSummary(account.getId(), account.getName(), account.getStatus()));
    }

    @Override
    public List<AccountBalance> listAccountBalances() {
        Map<Long, BigDecimal> nets = new HashMap<>();
        transactionMapper.selectNetByAccount().forEach(net -> nets.put(net.accountId(), net.net()));
        return accountMapper.selectList(new QueryWrapper<FundAccount>().orderByAsc("id")).stream()
                .map(account -> {
                    BigDecimal opening = account.getOpeningBalance() == null
                            ? BigDecimal.ZERO : account.getOpeningBalance();
                    BigDecimal balance = opening.add(nets.getOrDefault(account.getId(), BigDecimal.ZERO));
                    return new AccountBalance(account.getId(), account.getAccountNo(), account.getName(),
                            Money.str(opening), Money.str(balance));
                })
                .toList();
    }

    /** 供校验：账户是否启用（导入期初/出资/支出前置判断） */
    public boolean isEnabled(long accountId) {
        FundAccount account = accountMapper.selectById(accountId);
        return account != null && AccountStatus.ENABLED.code().equals(account.getStatus());
    }
}
