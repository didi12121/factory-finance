package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.modules.treasury.api.FundFlowPort;
import com.factoryfinance.modules.treasury.api.dto.VoidView;
import com.factoryfinance.modules.treasury.domain.DocStatus;
import com.factoryfinance.modules.treasury.domain.Expense;
import com.factoryfinance.modules.treasury.domain.ExpenseCategory;
import com.factoryfinance.modules.treasury.domain.FundAccount;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import com.factoryfinance.modules.treasury.domain.TxnDirection;
import com.factoryfinance.modules.treasury.domain.TxnStatus;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ExpenseMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Optional;

/**
 * {@link FundFlowPort} 实现（资金模块对外协作出入口）。
 *
 * <p>所有写操作在调用方事务内执行（同一数据库事务），保证业务单据与资金流水一致提交。</p>
 */
@Component
public class TreasuryFundFlowPort implements FundFlowPort {

    private final AccountLookup accountLookup;
    private final FundTransactionMapper transactionMapper;
    private final ExpenseMapper expenseMapper;
    private final VoidService voidService;
    private final VoidLookup voidLookup;

    public TreasuryFundFlowPort(AccountLookup accountLookup,
                                FundTransactionMapper transactionMapper,
                                ExpenseMapper expenseMapper,
                                VoidService voidService,
                                VoidLookup voidLookup) {
        this.accountLookup = accountLookup;
        this.transactionMapper = transactionMapper;
        this.expenseMapper = expenseMapper;
        this.voidService = voidService;
        this.voidLookup = voidLookup;
    }

    @Override
    public AccountRef requireAccountForFlow(long accountId, LocalDate businessDate, String dateField) {
        FundAccount account = accountLookup.requireForFlow(accountId, businessDate, dateField);
        return new AccountRef(account.getId(), account.getName(), account.getOpeningDate());
    }

    @Override
    public long recordFlow(FlowCommand command) {
        FundTransaction txn = new FundTransaction();
        txn.setTransactionNo(command.transactionNo());
        txn.setTransactionType(command.transactionType());
        txn.setTradeDate(command.tradeDate());
        txn.setAccountId(command.accountId());
        txn.setDirection(command.direction());
        txn.setAmount(command.amount());
        txn.setCounterparty(command.counterparty());
        txn.setSourceDocType(command.sourceDocType());
        txn.setSourceDocId(command.sourceDocId());
        txn.setStatus(TxnStatus.RECORDED.code());
        txn.setRemark(command.remark());
        try {
            transactionMapper.insert(txn);
        } catch (DuplicateKeyException duplicate) {
            throw BusinessException.conflict("资金流水已存在，禁止重复记账（"
                    + command.sourceDocType() + "#" + command.sourceDocId() + "）");
        }
        return txn.getId();
    }

    @Override
    public java.util.Map<Long, String> accountNames(java.util.Collection<Long> accountIds) {
        return accountLookup.names(accountIds);
    }

    @Override
    public java.util.Map<Long, VoidInfo> voidRecords(String targetDocType, java.util.Collection<Long> docIds) {
        java.util.Map<Long, VoidInfo> result = new java.util.HashMap<>();
        if (docIds == null || docIds.isEmpty() || targetDocType == null) {
            return result;
        }
        voidLookup.byTarget(targetDocType, new java.util.ArrayList<>(docIds))
                .forEach((docId, record) -> result.put(docId, new VoidInfo(record.getId(), record.getVoidNo(),
                        record.getVoidDate() == null ? null : record.getVoidDate().toString(),
                        record.getReason())));
        return result;
    }

    @Override
    public VoidOutcome reverseFundDocument(String targetDocType, long targetDocId, String targetDocNo,
                                           LocalDate voidDate, String reason) {
        VoidView view = voidService.voidExternalFundDocument(targetDocType, targetDocId, targetDocNo,
                voidDate, reason);
        return new VoidOutcome(view.id(), view.voidNo());
    }

    @Override
    public VoidOutcome registerVoidOnly(String targetDocType, long targetDocId, String targetDocNo,
                                        LocalDate voidDate, String reason) {
        VoidView view = voidService.registerVoidOnly(targetDocType, targetDocId, targetDocNo, voidDate, reason);
        return new VoidOutcome(view.id(), view.voidNo());
    }

    @Override
    public Optional<PurchasePaymentInfo> findConfirmedPurchaseExpense(long expenseId) {
        Expense expense = expenseMapper.selectById(expenseId);
        if (expense == null) {
            return Optional.empty();
        }
        if (!DocStatus.CONFIRMED.code().equals(expense.getStatus())
                || !ExpenseCategory.PURCHASE.code().equals(expense.getCategory())) {
            return Optional.empty();
        }
        return Optional.of(new PurchasePaymentInfo(expense.getId(), expense.getDocNo(),
                expense.getAmount(), expense.getPayDate()));
    }

    @Override
    public Optional<PurchasePaymentInfo> lockPurchaseExpense(long expenseId) {
        Expense expense = expenseMapper.selectByIdForUpdate(expenseId);
        if (expense == null
                || !DocStatus.CONFIRMED.code().equals(expense.getStatus())
                || !ExpenseCategory.PURCHASE.code().equals(expense.getCategory())) {
            return Optional.empty();
        }
        return Optional.of(new PurchasePaymentInfo(expense.getId(), expense.getDocNo(),
                expense.getAmount(), expense.getPayDate()));
    }

    @Override
    public java.util.List<PurchasePaymentInfo> listConfirmedPurchaseExpenses() {
        return expenseMapper.selectList(new QueryWrapper<Expense>()
                        .eq("category", ExpenseCategory.PURCHASE.code())
                        .eq("status", DocStatus.CONFIRMED.code())
                        .orderByDesc("pay_date")
                        .orderByDesc("id")
                        .last("LIMIT 500"))
                .stream()
                .map(expense -> new PurchasePaymentInfo(expense.getId(), expense.getDocNo(),
                        expense.getAmount(), expense.getPayDate()))
                .toList();
    }

    /** 供业务模块复用：资金流出方向常量 */
    public static String outflowDirection() {
        return TxnDirection.OUT.code();
    }

    /** 供业务模块复用：资金流入方向常量 */
    public static String inflowDirection() {
        return TxnDirection.IN.code();
    }
}
