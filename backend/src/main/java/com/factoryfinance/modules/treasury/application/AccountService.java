package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.treasury.api.dto.AccountView;
import com.factoryfinance.modules.treasury.api.dto.CreateAccountRequest;
import com.factoryfinance.modules.treasury.api.dto.UpdateAccountRequest;
import com.factoryfinance.modules.treasury.domain.AccountStatus;
import com.factoryfinance.modules.treasury.domain.AccountType;
import com.factoryfinance.modules.treasury.domain.FundAccount;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundAccountMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 资金账户用例（事务边界）。
 * 余额不落缓存列：currentBalance = opening_balance + ΣIN − ΣOUT（全部 RECORDED 流水）。
 */
@Service
public class AccountService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final FundAccountMapper accountMapper;
    private final FundTransactionMapper transactionMapper;
    private final AccountLookup accountLookup;
    private final DocNoGenerator docNoGenerator;
    private final BusinessTime businessTime;

    public AccountService(FundAccountMapper accountMapper,
                          FundTransactionMapper transactionMapper,
                          AccountLookup accountLookup,
                          DocNoGenerator docNoGenerator,
                          BusinessTime businessTime) {
        this.accountMapper = accountMapper;
        this.transactionMapper = transactionMapper;
        this.accountLookup = accountLookup;
        this.docNoGenerator = docNoGenerator;
        this.businessTime = businessTime;
    }

    public PageResult<AccountView> list(Integer page, Integer size, String keyword) {
        TreasuryValidation.requirePaging(page, size);
        long pageNo = page == null ? 1 : page;
        long pageSize = size == null ? 20 : size;
        String kw = keyword == null ? null : keyword.trim();
        Page<FundAccount> result = accountMapper.selectPage(new Page<>(pageNo, pageSize),
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<FundAccount>()
                        .and(kw != null && !kw.isEmpty(), w -> w.like("name", kw).or().like("account_no", kw))
                        .orderByAsc("id"));
        Map<Long, BigDecimal> nets = netByAccount();
        List<AccountView> items = result.getRecords().stream()
                .map(a -> toView(a, nets.getOrDefault(a.getId(), BigDecimal.ZERO)))
                .toList();
        return PageResult.of(items, result.getTotal(), (int) pageNo, (int) pageSize);
    }

    @Transactional
    public AccountView create(CreateAccountRequest request) {
        String name = TreasuryValidation.text(request.name(), "name", 128, true);
        AccountType type = parseType(request.accountType());
        BigDecimal opening = TreasuryValidation.parseOpeningAmount(request.openingBalance(), "openingBalance");
        LocalDate openingDate = TreasuryValidation.parseDate(request.openingDate(), "openingDate");
        TreasuryValidation.requireNotAfterToday(businessTime, openingDate, "openingDate");
        AccountStatus status = parseStatus(request.status());
        String remark = TreasuryValidation.text(request.remark(), "remark", 500, false);
        String accountNo = TreasuryValidation.text(request.accountNo(), "accountNo", 32, false);
        String generatedNo = accountNo != null ? accountNo : docNoGenerator.nextAccountNo();

        FundAccount account = new FundAccount();
        account.setAccountNo(generatedNo);
        account.setName(name);
        account.setAccountType(type.code());
        account.setOpeningBalance(opening);
        account.setOpeningDate(openingDate);
        account.setStatus(status.code());
        account.setRemark(remark);
        try {
            accountMapper.insert(account);
        } catch (DuplicateKeyException ex) {
            throw BusinessException.conflict("资金账户编号已存在：" + generatedNo);
        }
        return toView(account, BigDecimal.ZERO);
    }

    @Transactional
    public AccountView update(UpdateAccountRequest request) {
        FundAccount account = accountMapper.selectById(request.id());
        if (account == null) {
            throw BusinessException.notFound("资金账户");
        }
        boolean openingChanged = request.openingBalance() != null || request.openingDate() != null;
        if (openingChanged && accountLookup.hasTransactions(account.getId())) {
            throw BusinessException.conflict("账户已有资金流水，禁止修改期初余额/期初日期");
        }
        if (request.name() != null) {
            account.setName(TreasuryValidation.text(request.name(), "name", 128, true));
        }
        if (request.accountType() != null) {
            account.setAccountType(parseType(request.accountType()).code());
        }
        if (request.openingBalance() != null) {
            account.setOpeningBalance(
                    TreasuryValidation.parseOpeningAmount(request.openingBalance(), "openingBalance"));
        }
        if (request.openingDate() != null) {
            LocalDate openingDate = TreasuryValidation.parseDate(request.openingDate(), "openingDate");
            TreasuryValidation.requireNotAfterToday(businessTime, openingDate, "openingDate");
            account.setOpeningDate(openingDate);
        }
        if (request.status() != null) {
            account.setStatus(parseStatus(request.status()).code());
        }
        if (request.remark() != null) {
            account.setRemark(TreasuryValidation.text(request.remark(), "remark", 500, false));
        }
        accountMapper.updateById(account);
        BigDecimal net = netByAccount().getOrDefault(account.getId(), BigDecimal.ZERO);
        return toView(account, net);
    }

    private Map<Long, BigDecimal> netByAccount() {
        Map<Long, BigDecimal> nets = new HashMap<>();
        transactionMapper.selectNetByAccount().forEach(n -> nets.put(n.accountId(), n.net()));
        return nets;
    }

    private AccountType parseType(String raw) {
        return AccountType.fromCode(raw == null ? "" : raw.trim())
                .orElseThrow(() -> TreasuryValidation.invalid("accountType",
                        "账户类型不合法：应为 BANK/CASH/WECHAT/ALIPAY/OTHER 之一"));
    }

    private AccountStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank()) {
            return AccountStatus.ENABLED;
        }
        return AccountStatus.fromCode(raw.trim())
                .orElseThrow(() -> TreasuryValidation.invalid("status", "状态不合法：应为 ENABLED/DISABLED"));
    }

    private AccountView toView(FundAccount account, BigDecimal net) {
        BigDecimal balance = account.getOpeningBalance().add(net);
        return new AccountView(
                account.getId(),
                account.getAccountNo(),
                account.getName(),
                account.getAccountType(),
                Money.str(account.getOpeningBalance()),
                account.getOpeningDate().toString(),
                account.getStatus(),
                account.getRemark(),
                Money.str(balance),
                format(account.getCreatedAt()),
                account.getCreatedBy(),
                format(account.getUpdatedAt()),
                account.getUpdatedBy());
    }

    private static String format(LocalDateTime time) {
        return time == null ? null : ISO_DATETIME.format(time);
    }
}
