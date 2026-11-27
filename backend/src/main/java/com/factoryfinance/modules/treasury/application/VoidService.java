package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.treasury.api.dto.VoidRequest;
import com.factoryfinance.modules.treasury.api.dto.VoidView;
import com.factoryfinance.modules.treasury.domain.DocStatus;
import com.factoryfinance.modules.treasury.domain.Expense;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import com.factoryfinance.modules.treasury.domain.ShareholderContribution;
import com.factoryfinance.modules.treasury.domain.Transfer;
import com.factoryfinance.modules.treasury.domain.TxnDirection;
import com.factoryfinance.modules.treasury.domain.TxnStatus;
import com.factoryfinance.modules.treasury.domain.TxnType;
import com.factoryfinance.modules.treasury.domain.VoidRecord;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ExpenseMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ShareholderContributionMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.TransferMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.VoidRecordMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 撤销用例（事务边界）。
 *
 * <p>撤销语义（保留业务事实 + 更正）：</p>
 * <ul>
 *   <li>原单据保留：status=VOIDED、void_record_id 关联，可查询追溯；</li>
 *   <li>原流水保留（业务事实），同事务创建反向流水（source_doc_type='VOID'、
 *       source_doc_id=void_record.id、方向相反、金额相同）纠正余额；</li>
 *   <li>反向流水 trade_date = 撤销日（趋势按撤销日展示为更正）；</li>
 *   <li>uk_tst_void_target 防重复撤销：重复撤销 → 409 CONFLICT；</li>
 *   <li>撤销后余额与"期初 + 全部流水重算"一致（原流水 + 反向流水净额为 0）。</li>
 * </ul>
 */
@Service
public class VoidService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final ShareholderContributionMapper contributionMapper;
    private final ExpenseMapper expenseMapper;
    private final TransferMapper transferMapper;
    private final FundTransactionMapper transactionMapper;
    private final VoidRecordMapper voidRecordMapper;
    private final DocNoGenerator docNoGenerator;
    private final BusinessTime businessTime;

    public VoidService(ShareholderContributionMapper contributionMapper,
                       ExpenseMapper expenseMapper,
                       TransferMapper transferMapper,
                       FundTransactionMapper transactionMapper,
                       VoidRecordMapper voidRecordMapper,
                       DocNoGenerator docNoGenerator,
                       BusinessTime businessTime) {
        this.contributionMapper = contributionMapper;
        this.expenseMapper = expenseMapper;
        this.transferMapper = transferMapper;
        this.transactionMapper = transactionMapper;
        this.voidRecordMapper = voidRecordMapper;
        this.docNoGenerator = docNoGenerator;
        this.businessTime = businessTime;
    }

    @Transactional
    public VoidView voidContribution(long id, VoidRequest request) {
        ShareholderContribution doc = contributionMapper.selectById(id);
        if (doc == null) {
            throw BusinessException.notFound("出资单");
        }
        if (DocStatus.VOIDED.code().equals(doc.getStatus())) {
            throw BusinessException.conflict("出资单已撤销，禁止重复撤销：" + doc.getDocNo());
        }
        VoidContext context = prepare(request, TxnType.CONTRIBUTION, doc.getId(), doc.getDocNo());
        List<FundTransaction> originals = originalFlows(TxnType.CONTRIBUTION, doc.getId());
        VoidRecord record = createRecordAndReversals(context, doc.getDocNo(), originals, null);

        ShareholderContribution update = new ShareholderContribution();
        update.setId(doc.getId());
        update.setStatus(DocStatus.VOIDED.code());
        update.setVoidRecordId(record.getId());
        contributionMapper.updateById(update);

        return toView(record, doc.getDocNo(), context, originals);
    }

    @Transactional
    public VoidView voidExpense(long id, VoidRequest request) {
        Expense doc = expenseMapper.selectById(id);
        if (doc == null) {
            throw BusinessException.notFound("支出单");
        }
        if (DocStatus.VOIDED.code().equals(doc.getStatus())) {
            throw BusinessException.conflict("支出单已撤销，禁止重复撤销：" + doc.getDocNo());
        }
        VoidContext context = prepare(request, TxnType.EXPENSE, doc.getId(), doc.getDocNo());
        List<FundTransaction> originals = originalFlows(TxnType.EXPENSE, doc.getId());
        VoidRecord record = createRecordAndReversals(context, doc.getDocNo(), originals, null);

        Expense update = new Expense();
        update.setId(doc.getId());
        update.setStatus(DocStatus.VOIDED.code());
        update.setVoidRecordId(record.getId());
        expenseMapper.updateById(update);

        return toView(record, doc.getDocNo(), context, originals);
    }

    @Transactional
    public VoidView voidTransfer(long id, VoidRequest request) {
        Transfer doc = transferMapper.selectById(id);
        if (doc == null) {
            throw BusinessException.notFound("转账单");
        }
        if (DocStatus.VOIDED.code().equals(doc.getStatus())) {
            throw BusinessException.conflict("转账单已撤销，禁止重复撤销：" + doc.getDocNo());
        }
        VoidContext context = prepare(request, TxnType.TRANSFER, doc.getId(), doc.getDocNo());
        List<FundTransaction> originals = originalFlows(TxnType.TRANSFER, doc.getId());
        // 转账反向流水成对出现，沿用原转账 group（同一 group 可追溯整条转账链路）
        VoidRecord record = createRecordAndReversals(context, doc.getDocNo(), originals, doc.getDocNo());

        Transfer update = new Transfer();
        update.setId(doc.getId());
        update.setStatus(DocStatus.VOIDED.code());
        update.setVoidRecordId(record.getId());
        transferMapper.updateById(update);

        return toView(record, doc.getDocNo(), context, originals);
    }

    private VoidContext prepare(VoidRequest request, TxnType targetType, long targetId, String targetDocNo) {
        LocalDate voidDate = TreasuryValidation.parseDate(request.voidDate(), "voidDate");
        TreasuryValidation.requireNotAfterToday(businessTime, voidDate, "voidDate");
        String reason = TreasuryValidation.text(request.reason(), "reason", 500, false);
        return new VoidContext(targetType, targetId, targetDocNo, voidDate, reason,
                docNoGenerator.nextVoidNo(voidDate));
    }

    private List<FundTransaction> originalFlows(TxnType sourceType, long docId) {
        List<FundTransaction> originals = transactionMapper.selectList(new QueryWrapper<FundTransaction>()
                .eq("source_doc_type", sourceType.code())
                .eq("source_doc_id", docId)
                .orderByAsc("id"));
        if (originals.isEmpty()) {
            throw BusinessException.conflict("原资金流水缺失，禁止撤销（" + sourceType.code() + "#" + docId + "）");
        }
        return originals;
    }

    private VoidRecord createRecordAndReversals(VoidContext context, String targetDocNo,
                                                List<FundTransaction> originals, String transferGroupId) {
        VoidRecord record = new VoidRecord();
        record.setVoidNo(context.voidNo());
        record.setTargetDocType(context.targetType().code());
        record.setTargetDocId(context.targetId());
        record.setVoidDate(context.voidDate());
        record.setReason(context.reason());
        // reverse_transaction_id 先挂原流水占位（NOT NULL + FK），反向流水落库后更新为实际 id
        record.setReverseTransactionId(originals.get(0).getId());
        try {
            voidRecordMapper.insert(record);
        } catch (DuplicateKeyException duplicate) {
            throw BusinessException.conflict("该单据已撤销，禁止重复撤销：" + targetDocNo);
        }

        List<Long> reverseIds = new ArrayList<>();
        List<String> reverseNos = new ArrayList<>();
        int index = 1;
        for (FundTransaction original : originals) {
            FundTransaction reversal = new FundTransaction();
            String txnNo = docNoGenerator.transactionNo(context.voidNo(), index++);
            reversal.setTransactionNo(txnNo);
            reversal.setTransactionType(TxnType.VOID.code());
            reversal.setTradeDate(context.voidDate());
            reversal.setAccountId(original.getAccountId());
            reversal.setDirection(TxnDirection.fromCode(original.getDirection()).orElseThrow().opposite().code());
            BigDecimal amount = original.getAmount();
            reversal.setAmount(amount);
            reversal.setCounterparty(original.getCounterparty());
            reversal.setSourceDocType(TxnType.VOID.code());
            reversal.setSourceDocId(record.getId());
            reversal.setTransferGroupId(transferGroupId);
            reversal.setStatus(TxnStatus.RECORDED.code());
            reversal.setRemark(reversalRemark(context));
            try {
                transactionMapper.insert(reversal);
            } catch (DuplicateKeyException duplicate) {
                throw BusinessException.conflict("该单据已撤销，禁止重复撤销：" + targetDocNo);
            }
            reverseIds.add(reversal.getId());
            reverseNos.add(txnNo);
        }

        VoidRecord update = new VoidRecord();
        update.setId(record.getId());
        update.setReverseTransactionId(reverseIds.get(0));
        voidRecordMapper.updateById(update);

        context.reverseIds().addAll(reverseIds);
        context.reverseNos().addAll(reverseNos);
        return record;
    }

    private static String reversalRemark(VoidContext context) {
        String base = "撤销更正（" + context.voidNo() + "）"
                + (context.reason() == null ? "" : "：" + context.reason());
        return base.length() <= 500 ? base : base.substring(0, 500);
    }

    private VoidView toView(VoidRecord record, String targetDocNo, VoidContext context,
                            List<FundTransaction> originals) {
        return new VoidView(
                record.getId(),
                record.getVoidNo(),
                record.getTargetDocType(),
                record.getTargetDocId(),
                targetDocNo,
                record.getVoidDate().toString(),
                record.getReason(),
                List.copyOf(context.reverseIds()),
                List.copyOf(context.reverseNos()),
                record.getCreatedAt() == null ? null : ISO_DATETIME.format(record.getCreatedAt()),
                record.getCreatedBy());
    }

    /** 撤销过程上下文（单事务内使用） */
    private static final class VoidContext {
        private final TxnType targetType;
        private final long targetId;
        @SuppressWarnings("unused")
        private final String targetDocNo;
        private final LocalDate voidDate;
        private final String reason;
        private final String voidNo;
        private final List<Long> reverseIds = new ArrayList<>();
        private final List<String> reverseNos = new ArrayList<>();

        private VoidContext(TxnType targetType, long targetId, String targetDocNo,
                            LocalDate voidDate, String reason, String voidNo) {
            this.targetType = targetType;
            this.targetId = targetId;
            this.targetDocNo = targetDocNo;
            this.voidDate = voidDate;
            this.reason = reason;
            this.voidNo = voidNo;
        }

        TxnType targetType() {
            return targetType;
        }

        long targetId() {
            return targetId;
        }

        LocalDate voidDate() {
            return voidDate;
        }

        String reason() {
            return reason;
        }

        String voidNo() {
            return voidNo;
        }

        List<Long> reverseIds() {
            return reverseIds;
        }

        List<String> reverseNos() {
            return reverseNos;
        }
    }
}
