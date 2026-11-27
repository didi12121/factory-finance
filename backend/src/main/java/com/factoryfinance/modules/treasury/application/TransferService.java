package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.treasury.api.dto.CreateTransferRequest;
import com.factoryfinance.modules.treasury.api.dto.TransferView;
import com.factoryfinance.modules.treasury.domain.DocSeries;
import com.factoryfinance.modules.treasury.domain.DocStatus;
import com.factoryfinance.modules.treasury.domain.FundAccount;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import com.factoryfinance.modules.treasury.domain.Transfer;
import com.factoryfinance.modules.treasury.domain.TxnDirection;
import com.factoryfinance.modules.treasury.domain.TxnStatus;
import com.factoryfinance.modules.treasury.domain.TxnType;
import com.factoryfinance.modules.treasury.domain.VoidRecord;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.TransferMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 内部转账用例（事务边界）。
 * 一单两流水（from OUT + to IN，同 transfer_group_id=doc_no，同事务），整体净变化 0；
 * 账户间转账不产生收支。任一校验失败整单回滚，双方余额不变。
 */
@Service
public class TransferService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final TransferMapper transferMapper;
    private final FundTransactionMapper transactionMapper;
    private final AccountLookup accountLookup;
    private final DocNoGenerator docNoGenerator;
    private final VoidLookup voidLookup;
    private final BusinessTime businessTime;

    public TransferService(TransferMapper transferMapper,
                           FundTransactionMapper transactionMapper,
                           AccountLookup accountLookup,
                           DocNoGenerator docNoGenerator,
                           VoidLookup voidLookup,
                           BusinessTime businessTime) {
        this.transferMapper = transferMapper;
        this.transactionMapper = transactionMapper;
        this.accountLookup = accountLookup;
        this.docNoGenerator = docNoGenerator;
        this.voidLookup = voidLookup;
        this.businessTime = businessTime;
    }

    @Transactional
    public TransferView create(CreateTransferRequest request) {
        LocalDate date = TreasuryValidation.parseDate(request.transferDate(), "transferDate");
        TreasuryValidation.requireNotAfterToday(businessTime, date, "transferDate");
        BigDecimal amount = TreasuryValidation.parseAmount(request.amount(), "amount");
        String remark = TreasuryValidation.text(request.remark(), "remark", 500, false);
        String clientDocNo = TreasuryValidation.docNo(request.docNo(), DocSeries.TRANSFER.prefix());
        if (request.fromAccountId() == null) {
            throw TreasuryValidation.invalid("fromAccountId", "转出账户 id 必填");
        }
        if (request.fromAccountId().equals(request.toAccountId())) {
            throw TreasuryValidation.invalid("toAccountId", "转出账户与转入账户不能相同");
        }
        FundAccount from = accountLookup.requireEnabled(request.fromAccountId());
        FundAccount to = accountLookup.requireEnabled(request.toAccountId());

        String docNo = clientDocNo != null ? clientDocNo : docNoGenerator.next(DocSeries.TRANSFER, date);
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                Transfer doc = new Transfer();
                doc.setDocNo(docNo);
                doc.setTransferDate(date);
                doc.setFromAccountId(from.getId());
                doc.setToAccountId(to.getId());
                doc.setAmount(amount);
                doc.setRemark(remark);
                doc.setStatus(DocStatus.CONFIRMED.code());
                transferMapper.insert(doc);

                insertFlow(docNo, 1, doc, from, to, TxnDirection.OUT);
                insertFlow(docNo, 2, doc, to, from, TxnDirection.IN);

                return toView(doc, from.getName(), to.getName(), null);
            } catch (DuplicateKeyException duplicate) {
                if (clientDocNo != null) {
                    throw BusinessException.conflict("单据编号已存在，请勿重复提交：" + clientDocNo);
                }
                Transfer existing = transferMapper.selectByDocNoForUpdate(docNo);
                if (existing == null) {
                    throw BusinessException.conflict("提交冲突：资金流水已存在，请勿重复提交");
                }
                if (sameDocument(existing, date, from.getId(), to.getId(), amount, remark)) {
                    throw BusinessException.conflict("重复提交：相同转账单已存在（" + docNo + "）");
                }
                docNo = docNoGenerator.nextForUpdate(DocSeries.TRANSFER, date);
            }
        }
        throw BusinessException.conflict("单据编号并发冲突，请稍后重试");
    }

    private void insertFlow(String docNo, int index, Transfer doc, FundAccount account,
                            FundAccount counterAccount, TxnDirection direction) {
        FundTransaction txn = new FundTransaction();
        txn.setTransactionNo(docNoGenerator.transactionNo(docNo, index));
        txn.setTransactionType(TxnType.TRANSFER.code());
        txn.setTradeDate(doc.getTransferDate());
        txn.setAccountId(account.getId());
        txn.setDirection(direction.code());
        txn.setAmount(doc.getAmount());
        txn.setCounterparty(counterAccount.getName());
        txn.setSourceDocType(TxnType.TRANSFER.code());
        txn.setSourceDocId(doc.getId());
        txn.setTransferGroupId(docNo);
        txn.setStatus(TxnStatus.RECORDED.code());
        txn.setRemark(doc.getRemark());
        transactionMapper.insert(txn);
    }

    public PageResult<TransferView> list(Integer page, Integer size,
                                         String dateFrom, String dateTo,
                                         Long accountId, String status) {
        TreasuryValidation.requirePaging(page, size);
        LocalDate from = dateFrom == null ? null : TreasuryValidation.parseDate(dateFrom, "dateFrom");
        LocalDate to = dateTo == null ? null : TreasuryValidation.parseDate(dateTo, "dateTo");
        if (from != null && to != null && from.isAfter(to)) {
            throw TreasuryValidation.invalid("dateFrom", "起始日期不能晚于结束日期");
        }
        DocStatus docStatus = parseStatus(status);
        String statusCode = docStatus == null ? null : docStatus.code();

        long pageNo = page == null ? 1 : page;
        long pageSize = size == null ? 20 : size;
        QueryWrapper<Transfer> wrapper = new QueryWrapper<Transfer>()
                .ge(from != null, "transfer_date", from)
                .le(to != null, "transfer_date", to)
                .eq(docStatus != null, "status", statusCode)
                .orderByDesc("transfer_date")
                .orderByDesc("id");
        if (accountId != null) {
            wrapper.and(w -> w.eq("from_account_id", accountId).or().eq("to_account_id", accountId));
        }
        Page<Transfer> result = transferMapper.selectPage(new Page<>(pageNo, pageSize), wrapper);

        List<Transfer> rows = result.getRecords();
        if (rows.isEmpty()) {
            return PageResult.of(List.of(), result.getTotal(), (int) pageNo, (int) pageSize);
        }
        Map<Long, String> accountNames = accountLookup.names(
                rows.stream().flatMap(t -> List.of(t.getFromAccountId(), t.getToAccountId()).stream()).toList());
        Map<Long, VoidRecord> voids = voidLookup.byTarget(TxnType.TRANSFER.code(),
                rows.stream().map(Transfer::getId).toList());
        List<TransferView> items = rows.stream()
                .map(t -> toView(t,
                        accountNames.get(t.getFromAccountId()),
                        accountNames.get(t.getToAccountId()),
                        voids.get(t.getId())))
                .toList();
        return PageResult.of(items, result.getTotal(), (int) pageNo, (int) pageSize);
    }

    private TransferView toView(Transfer doc, String fromName, String toName, VoidRecord voidRecord) {
        return new TransferView(
                doc.getId(),
                doc.getDocNo(),
                doc.getTransferDate().toString(),
                doc.getFromAccountId(),
                fromName,
                doc.getToAccountId(),
                toName,
                Money.str(doc.getAmount()),
                doc.getRemark(),
                doc.getStatus(),
                doc.getVoidRecordId(),
                voidRecord == null ? null : voidRecord.getVoidNo(),
                voidRecord == null ? null : voidRecord.getVoidDate().toString(),
                doc.getCreatedAt() == null ? null : ISO_DATETIME.format(doc.getCreatedAt()),
                doc.getCreatedBy());
    }

    private static boolean sameDocument(Transfer existing, LocalDate date, Long fromId, Long toId,
                                        BigDecimal amount, String remark) {
        return Objects.equals(existing.getTransferDate(), date)
                && Objects.equals(existing.getFromAccountId(), fromId)
                && Objects.equals(existing.getToAccountId(), toId)
                && existing.getAmount() != null && existing.getAmount().compareTo(amount) == 0
                && Objects.equals(existing.getRemark(), remark);
    }

    private static DocStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        return DocStatus.fromCode(status.trim())
                .orElseThrow(() -> TreasuryValidation.invalid("status", "状态不合法：应为 CONFIRMED/VOIDED"));
    }
}
