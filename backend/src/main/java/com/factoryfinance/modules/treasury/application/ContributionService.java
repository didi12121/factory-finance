package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.idempotency.IdempotencyGuard;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.treasury.api.dto.ContributionView;
import com.factoryfinance.modules.treasury.api.dto.CreateContributionRequest;
import com.factoryfinance.modules.treasury.domain.DocSeries;
import com.factoryfinance.modules.treasury.domain.DocStatus;
import com.factoryfinance.modules.treasury.domain.FundAccount;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import com.factoryfinance.modules.treasury.domain.ShareholderContribution;
import com.factoryfinance.modules.treasury.domain.ShareholderDirectory;
import com.factoryfinance.modules.treasury.domain.TxnDirection;
import com.factoryfinance.modules.treasury.domain.TxnStatus;
import com.factoryfinance.modules.treasury.domain.TxnType;
import com.factoryfinance.modules.treasury.domain.VoidRecord;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ShareholderContributionMapper;
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
 * 股东出资用例（事务边界）。
 * 确认出资 = 业务单据 + IN 资金流水同事务提交；计入资金流入、不计营业收入。
 *
 * <p>幂等：请求幂等键（独立于业务单据编号）占位 → 业务写入 → 回填单据主键；
 * 同键同参返回原单据，同键异参 409，不同键的相同业务内容正常提交。
 * 单据编号唯一键仍作为编号冲突的最终防线。</p>
 */
@Service
public class ContributionService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String OPERATION = "CONTRIBUTION_CREATE";
    private static final int DOC_NO_RETRY_LIMIT = 3;

    private final ShareholderContributionMapper contributionMapper;
    private final FundTransactionMapper transactionMapper;
    private final ShareholderDirectory shareholderDirectory;
    private final AccountLookup accountLookup;
    private final DocNoGenerator docNoGenerator;
    private final VoidLookup voidLookup;
    private final BusinessTime businessTime;
    private final IdempotencyGuard idempotency;

    public ContributionService(ShareholderContributionMapper contributionMapper,
                               FundTransactionMapper transactionMapper,
                               ShareholderDirectory shareholderDirectory,
                               AccountLookup accountLookup,
                               DocNoGenerator docNoGenerator,
                               VoidLookup voidLookup,
                               BusinessTime businessTime,
                               IdempotencyGuard idempotency) {
        this.contributionMapper = contributionMapper;
        this.transactionMapper = transactionMapper;
        this.shareholderDirectory = shareholderDirectory;
        this.accountLookup = accountLookup;
        this.docNoGenerator = docNoGenerator;
        this.voidLookup = voidLookup;
        this.businessTime = businessTime;
        this.idempotency = idempotency;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ContributionView create(CreateContributionRequest request) {
        long shareholderId = request.shareholderId();
        ShareholderDirectory.ShareholderInfo shareholder = shareholderDirectory.findById(shareholderId)
                .orElseThrow(() -> BusinessException.notFound("股东"));
        if (!shareholder.enabled()) {
            throw TreasuryValidation.invalid("shareholderId", "股东已停用，禁止办理出资");
        }
        LocalDate date = TreasuryValidation.parseDate(request.contributionDate(), "contributionDate");
        TreasuryValidation.requireNotAfterToday(businessTime, date, "contributionDate");
        BigDecimal amount = TreasuryValidation.parseAmount(request.amount(), "amount");
        String remark = TreasuryValidation.text(request.remark(), "remark", 500, false);
        String clientDocNo = TreasuryValidation.docNo(request.docNo(), DocSeries.CONTRIBUTION.prefix());

        String idemKey = idempotency.requireKey(request.idempotencyKey());
        String fingerprint = idempotency.fingerprint(TxnType.CONTRIBUTION.code(),
                String.valueOf(shareholderId), date.toString(), String.valueOf(request.accountId()),
                Money.str(amount), remark);
        IdempotencyGuard.Reservation reservation = idempotency.reserve(OPERATION, idemKey, fingerprint);
        if (reservation.existing()) {
            return get(reservation.requireDocId());
        }

        FundAccount account = accountLookup.requireForFlow(request.accountId(), date, "contributionDate");
        String docNo = clientDocNo != null ? clientDocNo : docNoGenerator.next(DocSeries.CONTRIBUTION, date);

        ShareholderContribution doc = insertDocument(docNo, clientDocNo, shareholderId, date, account, amount, remark);

        FundTransaction txn = new FundTransaction();
        txn.setTransactionNo(docNoGenerator.transactionNo(doc.getDocNo(), 1));
        txn.setTransactionType(TxnType.CONTRIBUTION.code());
        txn.setTradeDate(date);
        txn.setAccountId(account.getId());
        txn.setDirection(TxnDirection.IN.code());
        txn.setAmount(amount);
        txn.setCounterparty(shareholder.name());
        txn.setSourceDocType(TxnType.CONTRIBUTION.code());
        txn.setSourceDocId(doc.getId());
        txn.setStatus(TxnStatus.RECORDED.code());
        txn.setRemark(remark);
        transactionMapper.insert(txn);

        idempotency.bind(reservation, TxnType.CONTRIBUTION.code(), doc.getId());
        return toView(doc, account.getName(), shareholder.name(), null);
    }

    /** 按主键读取出资单视图（幂等返回与详情查询共用） */
    public ContributionView get(long id) {
        ShareholderContribution doc = contributionMapper.selectById(id);
        if (doc == null) {
            throw BusinessException.notFound("出资单");
        }
        Map<Long, String> accountNames = accountLookup.names(List.of(doc.getAccountId()));
        Map<Long, String> shareholderNames = shareholderDirectory.names(List.of(doc.getShareholderId()));
        Map<Long, VoidRecord> voids = voidLookup.byTarget(TxnType.CONTRIBUTION.code(), List.of(doc.getId()));
        return toView(doc, accountNames.get(doc.getAccountId()),
                shareholderNames.get(doc.getShareholderId()), voids.get(doc.getId()));
    }

    private ShareholderContribution insertDocument(String initialDocNo, String clientDocNo, long shareholderId,
                                                   LocalDate date, FundAccount account, BigDecimal amount,
                                                   String remark) {
        String docNo = initialDocNo;
        for (int attempt = 0; ; attempt++) {
            ShareholderContribution doc = new ShareholderContribution();
            doc.setDocNo(docNo);
            doc.setShareholderId(shareholderId);
            doc.setContributionDate(date);
            doc.setAccountId(account.getId());
            doc.setAmount(amount);
            doc.setRemark(remark);
            doc.setStatus(DocStatus.CONFIRMED.code());
            try {
                contributionMapper.insert(doc);
                return doc;
            } catch (DuplicateKeyException duplicate) {
                if (clientDocNo != null) {
                    throw BusinessException.conflict("单据编号已存在，请勿重复提交：" + clientDocNo);
                }
                if (attempt >= DOC_NO_RETRY_LIMIT - 1) {
                    throw BusinessException.conflict("单据编号并发冲突，请稍后重试");
                }
                docNo = docNoGenerator.nextForUpdate(DocSeries.CONTRIBUTION, date);
            }
        }
    }

    public PageResult<ContributionView> list(Integer page, Integer size, String keyword,
                                             String dateFrom, String dateTo,
                                             Long shareholderId, Long accountId, String status) {
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
        String kw = keyword == null ? null : keyword.trim();
        Page<ShareholderContribution> result = contributionMapper.selectPage(new Page<>(pageNo, pageSize),
                new QueryWrapper<ShareholderContribution>()
                        .and(kw != null && !kw.isEmpty(), w -> w.like("doc_no", kw).or().like("remark", kw))
                        .ge(from != null, "contribution_date", from)
                        .le(to != null, "contribution_date", to)
                        .eq(shareholderId != null, "shareholder_id", shareholderId)
                        .eq(accountId != null, "account_id", accountId)
                        .eq(docStatus != null, "status", statusCode)
                        .orderByDesc("contribution_date")
                        .orderByDesc("id"));
        List<ContributionView> items = toViews(result.getRecords());
        return PageResult.of(items, result.getTotal(), (int) pageNo, (int) pageSize);
    }

    private List<ContributionView> toViews(List<ShareholderContribution> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<Long, String> accountNames = accountLookup.names(
                rows.stream().map(ShareholderContribution::getAccountId).toList());
        Map<Long, String> shareholderNames = shareholderDirectory.names(
                rows.stream().map(ShareholderContribution::getShareholderId).toList());
        Map<Long, VoidRecord> voids = voidLookup.byTarget(TxnType.CONTRIBUTION.code(),
                rows.stream().map(ShareholderContribution::getId).toList());
        return rows.stream()
                .map(d -> toView(d,
                        accountNames.get(d.getAccountId()),
                        shareholderNames.get(d.getShareholderId()),
                        voids.get(d.getId())))
                .toList();
    }

    private ContributionView toView(ShareholderContribution doc, String accountName,
                                    String shareholderName, VoidRecord voidRecord) {
        return new ContributionView(
                doc.getId(),
                doc.getDocNo(),
                doc.getShareholderId(),
                shareholderName,
                doc.getContributionDate().toString(),
                doc.getAccountId(),
                accountName,
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
