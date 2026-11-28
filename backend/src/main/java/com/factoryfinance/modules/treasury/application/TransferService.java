package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.idempotency.IdempotencyGuard;
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
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 内部转账用例（事务边界）。
 * 一单两流水（from OUT + to IN，同 transfer_group_id=doc_no，同事务），整体净变化 0；
 * 账户间转账不产生收支。任一校验失败整单回滚，双方余额不变。
 *
 * <p>业务日期规则：转账必须同时校验转出与转入账户的期初日期（业务日期不得早于任一方期初日期）；
 * 两账户按 id 升序加锁，避免并发互锁。</p>
 */
@Service
public class TransferService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String OPERATION = "TRANSFER_CREATE";
    private static final int DOC_NO_RETRY_LIMIT = 3;

    private final TransferMapper transferMapper;
    private final FundTransactionMapper transactionMapper;
    private final AccountLookup accountLookup;
    private final DocNoGenerator docNoGenerator;
    private final VoidLookup voidLookup;
    private final BusinessTime businessTime;
    private final IdempotencyGuard idempotency;

    public TransferService(TransferMapper transferMapper,
                           FundTransactionMapper transactionMapper,
                           AccountLookup accountLookup,
                           DocNoGenerator docNoGenerator,
                           VoidLookup voidLookup,
                           BusinessTime businessTime,
                           IdempotencyGuard idempotency) {
        this.transferMapper = transferMapper;
        this.transactionMapper = transactionMapper;
        this.accountLookup = accountLookup;
        this.docNoGenerator = docNoGenerator;
        this.voidLookup = voidLookup;
        this.businessTime = businessTime;
        this.idempotency = idempotency;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
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

        String idemKey = idempotency.requireKey(request.idempotencyKey());
        String fingerprint = idempotency.fingerprint(TxnType.TRANSFER.code(), date.toString(),
                String.valueOf(request.fromAccountId()), String.valueOf(request.toAccountId()),
                Money.str(amount), remark);
        IdempotencyGuard.Reservation reservation = idempotency.reserve(OPERATION, idemKey, fingerprint);
        if (reservation.existing()) {
            return get(reservation.requireDocId());
        }

        // 同时校验两个账户（含期初日期），按 id 升序加锁避免并发互锁
        long firstId = Math.min(request.fromAccountId(), request.toAccountId());
        long secondId = Math.max(request.fromAccountId(), request.toAccountId());
        FundAccount firstLocked = accountLookup.requireForFlow(firstId, date, "transferDate");
        FundAccount secondLocked = accountLookup.requireForFlow(secondId, date, "transferDate");
        FundAccount from = request.fromAccountId() == firstId ? firstLocked : secondLocked;
        FundAccount to = request.toAccountId() == secondId ? secondLocked : firstLocked;

        String docNo = clientDocNo != null ? clientDocNo : docNoGenerator.next(DocSeries.TRANSFER, date);
        Transfer doc = insertDocument(docNo, clientDocNo, date, from, to, amount, remark);

        insertFlow(doc.getDocNo(), 1, doc, from, to, TxnDirection.OUT);
        insertFlow(doc.getDocNo(), 2, doc, to, from, TxnDirection.IN);

        idempotency.bind(reservation, TxnType.TRANSFER.code(), doc.getId());
        return toView(doc, from.getName(), to.getName(), null);
    }

    /** 按主键读取转账单视图（幂等返回与详情查询共用） */
    public TransferView get(long id) {
        Transfer doc = transferMapper.selectById(id);
        if (doc == null) {
            throw BusinessException.notFound("转账单");
        }
        Map<Long, String> accountNames = accountLookup.names(
                List.of(doc.getFromAccountId(), doc.getToAccountId()));
        Map<Long, VoidRecord> voids = voidLookup.byTarget(TxnType.TRANSFER.code(), List.of(doc.getId()));
        return toView(doc, accountNames.get(doc.getFromAccountId()),
                accountNames.get(doc.getToAccountId()), voids.get(doc.getId()));
    }

    private Transfer insertDocument(String initialDocNo, String clientDocNo, LocalDate date,
                                    FundAccount from, FundAccount to, BigDecimal amount, String remark) {
        String docNo = initialDocNo;
        for (int attempt = 0; ; attempt++) {
            Transfer doc = new Transfer();
            doc.setDocNo(docNo);
            doc.setTransferDate(date);
            doc.setFromAccountId(from.getId());
            doc.setToAccountId(to.getId());
            doc.setAmount(amount);
            doc.setRemark(remark);
            doc.setStatus(DocStatus.CONFIRMED.code());
            try {
                transferMapper.insert(doc);
                return doc;
            } catch (DuplicateKeyException duplicate) {
                if (clientDocNo != null) {
                    throw BusinessException.conflict("单据编号已存在，请勿重复提交：" + clientDocNo);
                }
                if (attempt >= DOC_NO_RETRY_LIMIT - 1) {
                    throw BusinessException.conflict("单据编号并发冲突，请稍后重试");
                }
                docNo = docNoGenerator.nextForUpdate(DocSeries.TRANSFER, date);
            }
        }
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

    private static DocStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        return DocStatus.fromCode(status.trim())
                .orElseThrow(() -> TreasuryValidation.invalid("status", "状态不合法：应为 CONFIRMED/VOIDED"));
    }
}
