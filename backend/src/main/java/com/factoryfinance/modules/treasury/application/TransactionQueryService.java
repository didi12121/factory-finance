package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.treasury.api.dto.TransactionView;
import com.factoryfinance.modules.treasury.domain.Expense;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import com.factoryfinance.modules.treasury.domain.ShareholderContribution;
import com.factoryfinance.modules.treasury.domain.Transfer;
import com.factoryfinance.modules.treasury.domain.TxnDirection;
import com.factoryfinance.modules.treasury.domain.TxnType;
import com.factoryfinance.modules.treasury.domain.VoidRecord;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ExpenseMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ShareholderContributionMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.TransferMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 资金流水查询：分页 + 关键字/日期范围/账户/类型/方向筛选。
 * 返回含 source 单据类型/编号与撤销关联（voidNo/voidDate），原流水与反向流水均可追溯。
 */
@Service
public class TransactionQueryService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final FundTransactionMapper transactionMapper;
    private final ShareholderContributionMapper contributionMapper;
    private final ExpenseMapper expenseMapper;
    private final TransferMapper transferMapper;
    private final AccountLookup accountLookup;
    private final VoidLookup voidLookup;
    private final BusinessTime businessTime;

    public TransactionQueryService(FundTransactionMapper transactionMapper,
                                   ShareholderContributionMapper contributionMapper,
                                   ExpenseMapper expenseMapper,
                                   TransferMapper transferMapper,
                                   AccountLookup accountLookup,
                                   VoidLookup voidLookup,
                                   BusinessTime businessTime) {
        this.transactionMapper = transactionMapper;
        this.contributionMapper = contributionMapper;
        this.expenseMapper = expenseMapper;
        this.transferMapper = transferMapper;
        this.accountLookup = accountLookup;
        this.voidLookup = voidLookup;
        this.businessTime = businessTime;
    }

    public PageResult<TransactionView> search(Integer page, Integer size, String keyword,
                                              String dateFrom, String dateTo,
                                              Long accountId, String type, String direction) {
        TreasuryValidation.requirePaging(page, size);
        LocalDate from = dateFrom == null ? null : TreasuryValidation.parseDate(dateFrom, "dateFrom");
        LocalDate to = dateTo == null ? null : TreasuryValidation.parseDate(dateTo, "dateTo");
        if (from != null && to != null && from.isAfter(to)) {
            throw TreasuryValidation.invalid("dateFrom", "起始日期不能晚于结束日期");
        }
        if (to != null) {
            TreasuryValidation.requireNotAfterToday(businessTime, to, "dateTo");
        }
        TxnType txnType = null;
        if (type != null && !type.isBlank()) {
            txnType = TxnType.fromCode(type.trim())
                    .orElseThrow(() -> TreasuryValidation.invalid("type",
                            "流水类型不合法：应为 CONTRIBUTION/EXPENSE/TRANSFER/VOID 之一"));
        }
        TxnDirection txnDirection = null;
        if (direction != null && !direction.isBlank()) {
            txnDirection = TxnDirection.fromCode(direction.trim())
                    .orElseThrow(() -> TreasuryValidation.invalid("direction", "方向不合法：应为 IN/OUT"));
        }
        String kw = keyword == null || keyword.isBlank() ? null : keyword.trim();

        long pageNo = page == null ? 1 : page;
        long pageSize = size == null ? 20 : size;
        QueryWrapper<FundTransaction> wrapper = new QueryWrapper<FundTransaction>()
                .ge(from != null, "trade_date", from)
                .le(to != null, "trade_date", to)
                .eq(accountId != null, "account_id", accountId)
                .eq(txnType != null, "transaction_type", txnType == null ? null : txnType.code())
                .eq(txnDirection != null, "direction", txnDirection == null ? null : txnDirection.code())
                .orderByDesc("trade_date")
                .orderByDesc("id");
        if (kw != null) {
            String like = "%" + kw + "%";
            wrapper.and(w -> w.like("transaction_no", like)
                    .or().like("counterparty", like)
                    .or().like("remark", like));
        }
        Page<FundTransaction> result = transactionMapper.selectPage(new Page<>(pageNo, pageSize), wrapper);
        List<TransactionView> items = toViews(result.getRecords());
        return PageResult.of(items, result.getTotal(), (int) pageNo, (int) pageSize);
    }

    /** 流水行 → 视图（含账户名、来源单据编号、撤销关联），供流水查询与概览"近期流水"复用 */
    public List<TransactionView> toViews(List<FundTransaction> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<Long, String> accountNames = accountLookup.names(
                rows.stream().map(FundTransaction::getAccountId).toList());

        Set<Long> contributionIds = new HashSet<>();
        Set<Long> expenseIds = new HashSet<>();
        Set<Long> transferIds = new HashSet<>();
        Set<Long> voidIds = new HashSet<>();
        for (FundTransaction row : rows) {
            if (row.getSourceDocId() == null) {
                continue;
            }
            switch (row.getSourceDocType() == null ? "" : row.getSourceDocType()) {
                case "CONTRIBUTION" -> contributionIds.add(row.getSourceDocId());
                case "EXPENSE" -> expenseIds.add(row.getSourceDocId());
                case "TRANSFER" -> transferIds.add(row.getSourceDocId());
                case "VOID" -> voidIds.add(row.getSourceDocId());
                default -> {
                }
            }
        }
        Map<Long, String> sourceDocNos = new HashMap<>();
        if (!contributionIds.isEmpty()) {
            contributionMapper.selectBatchIds(contributionIds)
                    .forEach(d -> sourceDocNos.put(d.getId(), d.getDocNo()));
        }
        if (!expenseIds.isEmpty()) {
            expenseMapper.selectBatchIds(expenseIds)
                    .forEach(d -> sourceDocNos.put(d.getId(), d.getDocNo()));
        }
        if (!transferIds.isEmpty()) {
            transferMapper.selectBatchIds(transferIds)
                    .forEach(d -> sourceDocNos.put(d.getId(), d.getDocNo()));
        }

        Map<Long, VoidRecord> contributionVoids = voidLookup.byTarget(TxnType.CONTRIBUTION.code(), contributionIds);
        Map<Long, VoidRecord> expenseVoids = voidLookup.byTarget(TxnType.EXPENSE.code(), expenseIds);
        Map<Long, VoidRecord> transferVoids = voidLookup.byTarget(TxnType.TRANSFER.code(), transferIds);
        Map<Long, VoidRecord> voidsById = voidLookup.byIds(voidIds);
        voidsById.forEach((id, v) -> sourceDocNos.putIfAbsent(id, v.getVoidNo()));

        return rows.stream()
                .map(row -> toView(row,
                        accountNames.get(row.getAccountId()),
                        sourceDocNos.get(row.getSourceDocId()),
                        resolveVoid(row, contributionVoids, expenseVoids, transferVoids, voidsById)))
                .toList();
    }

    private static VoidRecord resolveVoid(FundTransaction row,
                                          Map<Long, VoidRecord> contributionVoids,
                                          Map<Long, VoidRecord> expenseVoids,
                                          Map<Long, VoidRecord> transferVoids,
                                          Map<Long, VoidRecord> voidsById) {
        if (row.getSourceDocType() == null || row.getSourceDocId() == null) {
            return null;
        }
        return switch (row.getSourceDocType()) {
            case "CONTRIBUTION" -> contributionVoids.get(row.getSourceDocId());
            case "EXPENSE" -> expenseVoids.get(row.getSourceDocId());
            case "TRANSFER" -> transferVoids.get(row.getSourceDocId());
            case "VOID" -> voidsById.get(row.getSourceDocId());
            default -> null;
        };
    }

    private static TransactionView toView(FundTransaction row, String accountName,
                                          String sourceDocNo, VoidRecord voidRecord) {
        return new TransactionView(
                row.getId(),
                row.getTransactionNo(),
                row.getTransactionType(),
                row.getTradeDate().toString(),
                row.getAccountId(),
                accountName,
                row.getDirection(),
                Money.str(row.getAmount()),
                row.getCounterparty(),
                row.getSourceDocType(),
                row.getSourceDocId(),
                sourceDocNo,
                row.getTransferGroupId(),
                row.getStatus(),
                row.getRemark(),
                voidRecord == null ? null : voidRecord.getId(),
                voidRecord == null ? null : voidRecord.getVoidNo(),
                voidRecord == null ? null : voidRecord.getVoidDate().toString(),
                voidRecord == null ? null : voidRecord.getReason(),
                row.getCreatedAt() == null ? null : ISO_DATETIME.format(row.getCreatedAt()),
                row.getCreatedBy());
    }
}
