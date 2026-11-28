package com.factoryfinance.modules.receivable.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.common.money.Money;
import com.factoryfinance.common.validation.ValidationRules;
import com.factoryfinance.infrastructure.idempotency.IdempotencyGuard;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.masterdata.api.CustomerDirectoryApi;
import com.factoryfinance.modules.receivable.api.dto.AllocationPreviewRequest;
import com.factoryfinance.modules.receivable.api.dto.AllocationPreviewView;
import com.factoryfinance.modules.receivable.api.dto.CreateReceiptRequest;
import com.factoryfinance.modules.receivable.api.dto.ReceiptAllocationRequest;
import com.factoryfinance.modules.receivable.api.dto.ReceiptAllocationView;
import com.factoryfinance.modules.receivable.api.dto.ReceiptView;
import com.factoryfinance.modules.receivable.domain.Receipt;
import com.factoryfinance.modules.receivable.domain.ReceiptAllocation;
import com.factoryfinance.modules.receivable.domain.Receivable;
import com.factoryfinance.modules.receivable.infrastructure.mapper.ReceiptAllocationMapper;
import com.factoryfinance.modules.receivable.infrastructure.mapper.ReceiptMapper;
import com.factoryfinance.modules.receivable.infrastructure.mapper.ReceivableMapper;
import com.factoryfinance.modules.treasury.api.FundFlowPort;
import com.factoryfinance.modules.treasury.api.dto.VoidRequest;
import com.factoryfinance.modules.treasury.api.dto.VoidView;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 加工费回款用例（事务边界）。
 *
 * <p>确认收款后在<b>同一数据库事务</b>内：</p>
 * <ol>
 *   <li>创建收款单；</li>
 *   <li>创建一条资金流入流水（一笔收款只记一次资金流入）；</li>
 *   <li>创建核销明细（一笔收款可核销多张应收单，一张应收单可分多次回款）；</li>
 * </ol>
 * <p>因此资金余额增加实际收款金额、应收余额减少核销金额，<b>营业收入不重复增加</b>
 * （收入在应收单确认时已按权责发生制登记）。</p>
 *
 * <p>本阶段为全额核销限制：Σ核销金额必须等于实际收款金额，未分配收款与预收款暂不实现。</p>
 *
 * <p>并发安全：核销前按应收单 id 升序 {@code SELECT ... FOR UPDATE} 锁定应收单行，
 * 再读取有效核销合计，保证同一应收单的并发核销不会超出剩余余额。</p>
 */
@Service
public class ReceiptService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String OPERATION = "RECEIPT_CREATE";
    private static final String DOC_TYPE = "RECEIPT";
    private static final String ALLOCATION_ACTIVE = "ACTIVE";
    private static final String ALLOCATION_REVERSED = "REVERSED";
    private static final int DOC_NO_RETRY_LIMIT = 3;

    private final ReceiptMapper receiptMapper;
    private final ReceivableMapper receivableMapper;
    private final ReceiptAllocationMapper allocationMapper;
    private final CustomerDirectoryApi customerDirectory;
    private final ReceivableDocNoGenerator docNoGenerator;
    private final FundFlowPort fundFlowPort;
    private final BusinessTime businessTime;
    private final IdempotencyGuard idempotency;

    public ReceiptService(ReceiptMapper receiptMapper,
                          ReceivableMapper receivableMapper,
                          ReceiptAllocationMapper allocationMapper,
                          CustomerDirectoryApi customerDirectory,
                          ReceivableDocNoGenerator docNoGenerator,
                          FundFlowPort fundFlowPort,
                          BusinessTime businessTime,
                          IdempotencyGuard idempotency) {
        this.receiptMapper = receiptMapper;
        this.receivableMapper = receivableMapper;
        this.allocationMapper = allocationMapper;
        this.customerDirectory = customerDirectory;
        this.docNoGenerator = docNoGenerator;
        this.fundFlowPort = fundFlowPort;
        this.businessTime = businessTime;
        this.idempotency = idempotency;
    }

    /** 核销行（应收单 + 本次核销金额） */
    private record AllocationLine(long receivableId, BigDecimal amount) {
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReceiptView create(CreateReceiptRequest request) {
        LocalDate today = businessTime.today();
        long customerId = request.customerId();
        CustomerDirectoryApi.CustomerInfo customer = customerDirectory.findCustomer(customerId)
                .orElseThrow(() -> BusinessException.notFound("客户"));
        if (!customer.enabled()) {
            throw ValidationRules.invalid("customerId", "客户已停用，禁止登记回款");
        }
        LocalDate receiptDate = ValidationRules.parseDate(request.receiptDate(), "receiptDate");
        ValidationRules.requireNotAfter(receiptDate, today, "receiptDate");
        BigDecimal actualAmount = ValidationRules.parseAmount(request.actualAmount(), "actualAmount");
        String externalRef = ValidationRules.text(request.externalRef(), "externalRef", 128, false);
        String remark = ValidationRules.text(request.remark(), "remark", 500, false);
        List<AllocationLine> lines = parseLines(request.allocations());

        String idemKey = idempotency.requireKey(request.idempotencyKey());
        String fingerprint = idempotency.fingerprint(DOC_TYPE, String.valueOf(customerId),
                receiptDate.toString(), String.valueOf(request.accountId()), Money.str(actualAmount),
                externalRef, remark, allocationFingerprint(lines));
        IdempotencyGuard.Reservation reservation = idempotency.reserve(OPERATION, idemKey, fingerprint);
        if (reservation.existing()) {
            return get(reservation.requireDocId());
        }

        FundFlowPort.AccountRef account = fundFlowPort.requireAccountForFlow(request.accountId(),
                receiptDate, "receiptDate");

        List<AllocationPreviewView.BusinessErrorView> errors = evaluateAllocations(customerId, actualAmount,
                lines, true);
        if (!errors.isEmpty()) {
            throw allocationErrors(errors);
        }

        Receipt receipt = insertReceipt(customerId, receiptDate, account.id(), actualAmount, externalRef, remark);

        long transactionId = fundFlowPort.recordFlow(new FundFlowPort.FlowCommand(
                "RECEIPT", receiptDate, account.id(), "IN", actualAmount,
                customer.name(), DOC_TYPE, receipt.getId(),
                docNoGenerator.transactionNo(receipt.getReceiptNo(), 1), remark));

        Receipt update = new Receipt();
        update.setId(receipt.getId());
        update.setFundTransactionId(transactionId);
        receiptMapper.updateById(update);
        receipt.setFundTransactionId(transactionId);

        for (AllocationLine line : lines) {
            ReceiptAllocation allocation = new ReceiptAllocation();
            allocation.setReceiptId(receipt.getId());
            allocation.setReceivableId(line.receivableId());
            allocation.setAllocationAmount(line.amount());
            allocation.setStatus(ALLOCATION_ACTIVE);
            allocation.setAllocatedAt(LocalDateTime.now());
            allocationMapper.insert(allocation);
        }

        idempotency.bind(reservation, DOC_TYPE, receipt.getId());
        return get(receipt.getId());
    }

    /** 核销方案预览（不落库、不产生流水） */
    public AllocationPreviewView preview(AllocationPreviewRequest request) {
        long customerId = request.customerId();
        customerDirectory.findCustomer(customerId).orElseThrow(() -> BusinessException.notFound("客户"));
        BigDecimal actualAmount = ValidationRules.parseAmount(request.actualAmount(), "actualAmount");
        List<AllocationLine> lines = request.allocations() == null || request.allocations().isEmpty()
                ? List.of()
                : parseLines(request.allocations());
        List<AllocationPreviewView.BusinessErrorView> errors = evaluateAllocations(customerId, actualAmount,
                lines, false);
        return toPreview(lines, actualAmount, errors);
    }

    /** 按到期日自动分配（只预览，不落库）：到期日最早优先，无到期日排最后 */
    public AllocationPreviewView autoAllocate(AllocationPreviewRequest request) {
        long customerId = request.customerId();
        customerDirectory.findCustomer(customerId).orElseThrow(() -> BusinessException.notFound("客户"));
        BigDecimal actualAmount = ValidationRules.parseAmount(request.actualAmount(), "actualAmount");

        List<Receivable> open = receivableMapper.selectList(new QueryWrapper<Receivable>()
                .eq("customer_id", customerId)
                .eq("status", "CONFIRMED"));
        LocalDate today = businessTime.today();
        List<Receivable> ordered = new ArrayList<>(open.stream()
                .filter(row -> outstandingOf(row.getId()).signum() > 0)
                .toList());
        ordered.sort(Comparator
                .comparing((Receivable row) -> row.getDueDate() == null)
                .thenComparing(row -> row.getDueDate() == null ? LocalDate.MAX : row.getDueDate())
                .thenComparing(Receivable::getStatementDate)
                .thenComparing(Receivable::getId));

        List<AllocationLine> lines = new ArrayList<>();
        BigDecimal remaining = actualAmount;
        for (Receivable row : ordered) {
            if (remaining.signum() <= 0) {
                break;
            }
            BigDecimal outstanding = outstandingOf(row.getId());
            BigDecimal take = remaining.min(outstanding);
            if (take.signum() > 0) {
                lines.add(new AllocationLine(row.getId(), Money.canonical(take)));
                remaining = remaining.subtract(take);
            }
        }
        List<AllocationPreviewView.BusinessErrorView> errors = new ArrayList<>();
        if (remaining.signum() > 0) {
            errors.add(new AllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                    "客户未结清应收余额不足以全额核销：" + Money.str(remaining) + " 尚未分配（本阶段不支持未分配收款与预收款）"));
        }
        if (lines.isEmpty()) {
            errors.add(new AllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                    "该客户当前没有可核销的应收单"));
        }
        return toPreview(lines, actualAmount, errors);
    }

    /** 确认前校验（返回错误列表，空数组表示可确认） */
    public List<AllocationPreviewView.BusinessErrorView> validate(CreateReceiptRequest request) {
        try {
            long customerId = request.customerId();
            customerDirectory.findCustomer(customerId).orElseThrow(() -> BusinessException.notFound("客户"));
            BigDecimal actualAmount = ValidationRules.parseAmount(request.actualAmount(), "actualAmount");
            ValidationRules.parseDate(request.receiptDate(), "receiptDate");
            List<AllocationLine> lines = parseLines(request.allocations());
            return evaluateAllocations(customerId, actualAmount, lines, false);
        } catch (BusinessException ex) {
            return List.of(new AllocationPreviewView.BusinessErrorView(ex.getErrorCode().name(), ex.getMessage()));
        }
    }

    /** 收款单列表（关键字/日期范围/客户/账户） */
    public PageResult<ReceiptView> list(Integer page, Integer size, String keyword,
                                        String dateFrom, String dateTo, Long customerId, Long accountId) {
        ValidationRules.requirePaging(page, size);
        LocalDate from = dateFrom == null || dateFrom.isBlank() ? null : ValidationRules.parseDate(dateFrom, "dateFrom");
        LocalDate to = dateTo == null || dateTo.isBlank() ? null : ValidationRules.parseDate(dateTo, "dateTo");
        if (from != null && to != null && from.isAfter(to)) {
            throw ValidationRules.invalid("dateFrom", "起始日期不能晚于结束日期");
        }
        long pageNo = page == null ? 1 : page;
        long pageSize = size == null ? 20 : size;
        String kw = keyword == null ? null : keyword.trim();
        Page<Receipt> result = receiptMapper.selectPage(new Page<>(pageNo, pageSize),
                new QueryWrapper<Receipt>()
                        .and(kw != null && !kw.isEmpty(), w -> w.like("receipt_no", kw)
                                .or().like("external_ref", kw).or().like("remark", kw))
                        .ge(from != null, "receipt_date", from)
                        .le(to != null, "receipt_date", to)
                        .eq(customerId != null, "customer_id", customerId)
                        .eq(accountId != null, "account_id", accountId)
                        .orderByDesc("receipt_date")
                        .orderByDesc("id"));
        List<ReceiptView> items = toViews(result.getRecords());
        return PageResult.of(items, result.getTotal(), (int) pageNo, (int) pageSize);
    }

    /** 收款单详情（含核销明细） */
    public ReceiptView get(long id) {
        Receipt receipt = receiptMapper.selectById(id);
        if (receipt == null) {
            throw BusinessException.notFound("收款单");
        }
        List<ReceiptView> views = toViews(List.of(receipt));
        return views.get(0);
    }

    /**
     * 撤销收款单：保留原单据与原核销明细；同事务登记撤销记录 + 反向资金流水（冲回资金流入），
     * 核销明细置 REVERSED（可追溯），应收余额恢复。
     */
    @Transactional
    public VoidView voidReceipt(long id, VoidRequest request) {
        Receipt receipt = receiptMapper.selectByIdForUpdate(id);
        if (receipt == null) {
            throw BusinessException.notFound("收款单");
        }
        if ("VOIDED".equals(receipt.getStatus())) {
            throw BusinessException.conflict("收款单已撤销，禁止重复撤销：" + receipt.getReceiptNo());
        }
        LocalDate voidDate = ValidationRules.parseDate(request.voidDate(), "voidDate");
        ValidationRules.requireNotAfter(voidDate, businessTime.today(), "voidDate");
        if (voidDate.isBefore(receipt.getReceiptDate())) {
            throw ValidationRules.invalid("voidDate",
                    "撤销日期不能早于原业务日期（" + receipt.getReceiptDate() + "）");
        }
        String reason = ValidationRules.text(request.reason(), "reason", 500, false);
        FundFlowPort.VoidOutcome outcome = fundFlowPort.reverseFundDocument(DOC_TYPE, id,
                receipt.getReceiptNo(), voidDate, reason);

        List<ReceiptAllocation> allocations = allocationMapper.selectByReceipt(id);
        for (ReceiptAllocation allocation : allocations) {
            if (!ALLOCATION_ACTIVE.equals(allocation.getStatus())) {
                continue;
            }
            ReceiptAllocation update = new ReceiptAllocation();
            update.setId(allocation.getId());
            update.setStatus(ALLOCATION_REVERSED);
            update.setReversedVoidRecordId(outcome.voidRecordId());
            allocationMapper.updateById(update);
        }

        Receipt update = new Receipt();
        update.setId(id);
        update.setStatus("VOIDED");
        update.setVoidRecordId(outcome.voidRecordId());
        receiptMapper.updateById(update);

        return new VoidView(outcome.voidRecordId(), outcome.voidNo(), DOC_TYPE, id, receipt.getReceiptNo(),
                voidDate.toString(), reason, List.of(), List.of(), null, null);
    }

    /* ------------------------------ 内部实现 ------------------------------ */

    private List<AllocationLine> parseLines(List<ReceiptAllocationRequest> raw) {
        if (raw == null || raw.isEmpty()) {
            throw ValidationRules.invalid("allocations", "至少需要一条核销明细（本阶段不支持未分配收款与预收款）");
        }
        Set<Long> seen = new LinkedHashSet<>();
        List<AllocationLine> lines = new ArrayList<>();
        for (ReceiptAllocationRequest item : raw) {
            if (item.receivableId() == null) {
                throw ValidationRules.invalid("allocations", "核销明细的应收单 id 必填");
            }
            if (!seen.add(item.receivableId())) {
                throw ValidationRules.invalid("allocations", "同一应收单不能重复出现在核销明细中");
            }
            BigDecimal amount = ValidationRules.parseAmount(item.amount(), "allocations");
            lines.add(new AllocationLine(item.receivableId(), amount));
        }
        return lines;
    }

    private static String allocationFingerprint(List<AllocationLine> lines) {
        StringBuilder sb = new StringBuilder();
        for (AllocationLine line : lines) {
            sb.append(line.receivableId()).append(':').append(Money.str(line.amount())).append(';');
        }
        return sb.toString();
    }

    /**
     * 核销校验（不写入）：
     * 单笔 &gt; 0；不得跨客户；不得超出应收单剩余余额；本阶段要求全额核销。
     */
    private List<AllocationPreviewView.BusinessErrorView> evaluateAllocations(long customerId,
                                                                             BigDecimal actualAmount,
                                                                             List<AllocationLine> lines,
                                                                             boolean locking) {
        List<AllocationPreviewView.BusinessErrorView> errors = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (AllocationLine line : lines) {
            total = total.add(line.amount());
        }
        if (total.compareTo(actualAmount) > 0) {
            errors.add(new AllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                    "核销金额合计（" + Money.str(total) + "）不能超过实际收款金额（" + Money.str(actualAmount) + "）"));
        }
        List<AllocationLine> ordered = new ArrayList<>(lines);
        ordered.sort(Comparator.comparingLong(AllocationLine::receivableId));
        for (AllocationLine line : ordered) {
            Receivable receivable = locking
                    ? receivableMapper.selectByIdForUpdate(line.receivableId())
                    : receivableMapper.selectById(line.receivableId());
            if (receivable == null) {
                errors.add(new AllocationPreviewView.BusinessErrorView("NOT_FOUND",
                        "应收单不存在：" + line.receivableId()));
                continue;
            }
            if (!"CONFIRMED".equals(receivable.getStatus())) {
                errors.add(new AllocationPreviewView.BusinessErrorView("CONFLICT",
                        "应收单已撤销，不可核销：" + receivable.getStatementNo()));
                continue;
            }
            if (receivable.getCustomerId() == null || receivable.getCustomerId() != customerId) {
                errors.add(new AllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                        "不允许跨客户核销：应收单 " + receivable.getStatementNo() + " 不属于所选客户"));
                continue;
            }
            BigDecimal outstanding = receivable.getOriginalAmount().subtract(
                    receivableMapper.selectActiveAllocatedSum(receivable.getId()));
            if (line.amount().compareTo(outstanding) > 0) {
                errors.add(new AllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                        "核销金额超过应收单剩余余额：" + receivable.getStatementNo()
                                + "（剩余 " + Money.str(outstanding) + "）"));
            }
        }
        if (errors.isEmpty() && total.compareTo(actualAmount) < 0) {
            errors.add(new AllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                    "本阶段仅支持全额核销：核销合计必须等于实际收款金额（未分配收款与预收款暂不实现）"));
        }
        return errors;
    }

    private AllocationPreviewView toPreview(List<AllocationLine> lines, BigDecimal actualAmount,
                                            List<AllocationPreviewView.BusinessErrorView> errors) {
        BigDecimal total = BigDecimal.ZERO;
        List<ReceiptAllocationRequest> echo = new ArrayList<>();
        for (AllocationLine line : lines) {
            total = total.add(line.amount());
            echo.add(new ReceiptAllocationRequest(line.receivableId(), Money.str(line.amount())));
        }
        BigDecimal unallocated = actualAmount.subtract(total);
        if (unallocated.signum() < 0) {
            unallocated = BigDecimal.ZERO;
        }
        return new AllocationPreviewView(echo, Money.str(total), Money.str(unallocated), errors);
    }

    private BusinessException allocationErrors(List<AllocationPreviewView.BusinessErrorView> errors) {
        AllocationPreviewView.BusinessErrorView first = errors.get(0);
        var errorCode = "CONFLICT".equals(first.code())
                ? com.factoryfinance.common.api.ErrorCode.CONFLICT
                : ValidationRules.invalid("allocations", first.message()).getErrorCode();
        return new BusinessException(errorCode, first.message(),
                Map.of("fieldErrors", Map.of("allocations", first.message())));
    }

    private Receipt insertReceipt(long customerId, LocalDate receiptDate, long accountId, BigDecimal actualAmount,
                                  String externalRef, String remark) {
        String receiptNo = docNoGenerator.nextReceiptNo(receiptDate);
        for (int attempt = 0; ; attempt++) {
            Receipt receipt = new Receipt();
            receipt.setReceiptNo(receiptNo);
            receipt.setCustomerId(customerId);
            receipt.setReceiptDate(receiptDate);
            receipt.setAccountId(accountId);
            receipt.setActualAmount(actualAmount);
            receipt.setExternalRef(externalRef);
            receipt.setRemark(remark);
            receipt.setStatus("CONFIRMED");
            try {
                receiptMapper.insert(receipt);
                return receipt;
            } catch (DuplicateKeyException duplicate) {
                if (attempt >= DOC_NO_RETRY_LIMIT - 1) {
                    throw BusinessException.conflict("收款单编号并发冲突，请稍后重试");
                }
                receiptNo = docNoGenerator.nextReceiptNoForUpdate(receiptDate);
            }
        }
    }

    private BigDecimal outstandingOf(long receivableId) {
        Receivable receivable = receivableMapper.selectById(receivableId);
        if (receivable == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal outstanding = receivable.getOriginalAmount()
                .subtract(receivableMapper.selectActiveAllocatedSum(receivableId));
        return outstanding.signum() < 0 ? BigDecimal.ZERO : outstanding;
    }

    private List<ReceiptView> toViews(List<Receipt> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<Long> receiptIds = rows.stream().map(Receipt::getId).toList();
        List<ReceiptAllocation> allocations = allocationMapper.selectByReceipts(receiptIds);

        Set<Long> receivableIds = new LinkedHashSet<>();
        allocations.forEach(a -> receivableIds.add(a.getReceivableId()));
        Map<Long, String> statementNos = new HashMap<>();
        if (!receivableIds.isEmpty()) {
            receivableMapper.selectBatchIds(receivableIds)
                    .forEach(r -> statementNos.put(r.getId(), r.getStatementNo()));
        }
        Map<Long, String> customerNames = customerDirectory.customerNames(
                rows.stream().map(Receipt::getCustomerId).distinct().toList());
        Map<Long, String> accountNames = fundFlowPort.accountNames(
                rows.stream().map(Receipt::getAccountId).distinct().toList());
        Map<Long, FundFlowPort.VoidInfo> voids = fundFlowPort.voidRecords(DOC_TYPE, receiptIds);

        Map<Long, List<ReceiptAllocationView>> allocationsByReceipt = new HashMap<>();
        Map<Long, String> receiptNos = new HashMap<>();
        rows.forEach(receipt -> receiptNos.put(receipt.getId(), receipt.getReceiptNo()));
        for (ReceiptAllocation allocation : allocations) {
            allocationsByReceipt.computeIfAbsent(allocation.getReceiptId(), key -> new ArrayList<>())
                    .add(new ReceiptAllocationView(allocation.getId(), allocation.getReceiptId(),
                            receiptNos.get(allocation.getReceiptId()),
                            allocation.getReceivableId(),
                            statementNos.get(allocation.getReceivableId()),
                            Money.str(allocation.getAllocationAmount()), allocation.getStatus(),
                            format(allocation.getAllocatedAt())));
        }

        return rows.stream().map(receipt -> {
            FundFlowPort.VoidInfo voidInfo = voids.get(receipt.getId());
            return new ReceiptView(receipt.getId(), receipt.getReceiptNo(), receipt.getCustomerId(),
                    customerNames.get(receipt.getCustomerId()), receipt.getReceiptDate().toString(),
                    receipt.getAccountId(), accountNames.get(receipt.getAccountId()),
                    Money.str(receipt.getActualAmount()), receipt.getFundTransactionId(),
                    receipt.getFundTransactionId() == null
                            ? null : docNoGenerator.transactionNo(receipt.getReceiptNo(), 1),
                    receipt.getExternalRef(), receipt.getRemark(), receipt.getStatus(),
                    receipt.getVoidRecordId(),
                    voidInfo == null ? null : voidInfo.voidNo(),
                    voidInfo == null ? null : voidInfo.voidDate(),
                    allocationsByReceipt.getOrDefault(receipt.getId(), List.of()),
                    format(receipt.getCreatedAt()), receipt.getCreatedBy());
        }).toList();
    }

    private static String format(LocalDateTime time) {
        return time == null ? null : ISO_DATETIME.format(time);
    }
}
