package com.factoryfinance.modules.payable.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.ErrorCode;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.common.money.Money;
import com.factoryfinance.common.validation.ValidationRules;
import com.factoryfinance.infrastructure.idempotency.IdempotencyGuard;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.masterdata.api.SupplierDirectoryApi;
import com.factoryfinance.modules.payable.api.dto.CreatePaymentRequest;
import com.factoryfinance.modules.payable.api.dto.PayableAllocationPreviewRequest;
import com.factoryfinance.modules.payable.api.dto.PayableAllocationPreviewView;
import com.factoryfinance.modules.payable.api.dto.PayableAllocationRequest;
import com.factoryfinance.modules.payable.api.dto.PaymentAllocationView;
import com.factoryfinance.modules.payable.api.dto.PaymentView;
import com.factoryfinance.modules.payable.domain.Payable;
import com.factoryfinance.modules.payable.domain.Payment;
import com.factoryfinance.modules.payable.domain.PaymentAllocation;
import com.factoryfinance.modules.payable.infrastructure.mapper.PayableMapper;
import com.factoryfinance.modules.payable.infrastructure.mapper.PaymentAllocationMapper;
import com.factoryfinance.modules.payable.infrastructure.mapper.PaymentMapper;
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
 * 应付付款用例（事务边界）。
 *
 * <p>确认付款在同一数据库事务内创建付款单 + 一条资金流出流水 + 核销明细；
 * 确认付款后才生成实际资金流出并减少对应应付余额。支持部分付款与多单核销；
 * 本阶段不支持未分配付款与预付款。已由 Phase 1 采购支出直接支付的应付单禁止再次付款。</p>
 *
 * <p>并发安全：按应付单 id 升序 {@code SELECT ... FOR UPDATE} 锁定应付单行后读取
 * 有效付款核销合计，保证不超额付款。</p>
 */
@Service
public class PaymentService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String OPERATION = "PAYMENT_CREATE";
    private static final String DOC_TYPE = "PAYMENT";
    private static final String ALLOCATION_ACTIVE = "ACTIVE";
    private static final String ALLOCATION_REVERSED = "REVERSED";
    private static final int DOC_NO_RETRY_LIMIT = 3;

    private final PaymentMapper paymentMapper;
    private final PayableMapper payableMapper;
    private final PaymentAllocationMapper allocationMapper;
    private final SupplierDirectoryApi supplierDirectory;
    private final PayableDocNoGenerator docNoGenerator;
    private final FundFlowPort fundFlowPort;
    private final BusinessTime businessTime;
    private final IdempotencyGuard idempotency;

    public PaymentService(PaymentMapper paymentMapper,
                          PayableMapper payableMapper,
                          PaymentAllocationMapper allocationMapper,
                          SupplierDirectoryApi supplierDirectory,
                          PayableDocNoGenerator docNoGenerator,
                          FundFlowPort fundFlowPort,
                          BusinessTime businessTime,
                          IdempotencyGuard idempotency) {
        this.paymentMapper = paymentMapper;
        this.payableMapper = payableMapper;
        this.allocationMapper = allocationMapper;
        this.supplierDirectory = supplierDirectory;
        this.docNoGenerator = docNoGenerator;
        this.fundFlowPort = fundFlowPort;
        this.businessTime = businessTime;
        this.idempotency = idempotency;
    }

    private record AllocationLine(long payableId, BigDecimal amount) {
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PaymentView create(CreatePaymentRequest request) {
        LocalDate today = businessTime.today();
        long supplierId = request.supplierId();
        SupplierDirectoryApi.SupplierInfo supplier = supplierDirectory.findSupplier(supplierId)
                .orElseThrow(() -> BusinessException.notFound("供应商"));
        if (!supplier.enabled()) {
            throw ValidationRules.invalid("supplierId", "供应商已停用，禁止付款");
        }
        LocalDate paymentDate = ValidationRules.parseDate(request.paymentDate(), "paymentDate");
        ValidationRules.requireNotAfter(paymentDate, today, "paymentDate");
        BigDecimal amount = ValidationRules.parseAmount(request.amount(), "amount");
        String externalRef = ValidationRules.text(request.externalRef(), "externalRef", 128, false);
        String remark = ValidationRules.text(request.remark(), "remark", 500, false);
        List<AllocationLine> lines = parseLines(request.allocations());

        String idemKey = idempotency.requireKey(request.idempotencyKey());
        String fingerprint = idempotency.fingerprint(DOC_TYPE, String.valueOf(supplierId),
                paymentDate.toString(), String.valueOf(request.accountId()), Money.str(amount),
                externalRef, remark, allocationFingerprint(lines));
        IdempotencyGuard.Reservation reservation = idempotency.reserve(OPERATION, idemKey, fingerprint);
        if (reservation.existing()) {
            return get(reservation.requireDocId());
        }

        FundFlowPort.AccountRef account = fundFlowPort.requireAccountForFlow(request.accountId(),
                paymentDate, "paymentDate");

        List<PayableAllocationPreviewView.BusinessErrorView> errors = evaluate(supplierId, amount, lines, true);
        if (!errors.isEmpty()) {
            throw allocationErrors(errors);
        }

        Payment payment = insertPayment(supplierId, paymentDate, account.id(), amount, externalRef, remark);
        long transactionId = fundFlowPort.recordFlow(new FundFlowPort.FlowCommand(
                "PAYMENT", paymentDate, account.id(), "OUT", amount,
                supplier.name(), DOC_TYPE, payment.getId(),
                docNoGenerator.transactionNo(payment.getPaymentNo(), 1), remark));

        Payment update = new Payment();
        update.setId(payment.getId());
        update.setFundTransactionId(transactionId);
        paymentMapper.updateById(update);
        payment.setFundTransactionId(transactionId);

        for (AllocationLine line : lines) {
            PaymentAllocation allocation = new PaymentAllocation();
            allocation.setPaymentId(payment.getId());
            allocation.setPayableId(line.payableId());
            allocation.setAllocationAmount(line.amount());
            allocation.setStatus(ALLOCATION_ACTIVE);
            allocation.setAllocatedAt(LocalDateTime.now());
            allocationMapper.insert(allocation);
        }

        idempotency.bind(reservation, DOC_TYPE, payment.getId());
        return get(payment.getId());
    }

    /** 付款核销预览（不落库） */
    public PayableAllocationPreviewView preview(PayableAllocationPreviewRequest request) {
        customerOrSupplier(request.supplierId());
        BigDecimal amount = ValidationRules.parseAmount(request.amount(), "amount");
        List<AllocationLine> lines = request.allocations() == null || request.allocations().isEmpty()
                ? List.of() : parseLines(request.allocations());
        return toPreview(lines, amount, evaluate(request.supplierId(), amount, lines, false));
    }

    /** 确认前校验（返回错误列表） */
    public List<PayableAllocationPreviewView.BusinessErrorView> validate(CreatePaymentRequest request) {
        try {
            customerOrSupplier(request.supplierId());
            BigDecimal amount = ValidationRules.parseAmount(request.amount(), "amount");
            ValidationRules.parseDate(request.paymentDate(), "paymentDate");
            List<AllocationLine> lines = parseLines(request.allocations());
            return evaluate(request.supplierId(), amount, lines, false);
        } catch (BusinessException ex) {
            return List.of(new PayableAllocationPreviewView.BusinessErrorView(ex.getErrorCode().name(),
                    ex.getMessage()));
        }
    }

    public PageResult<PaymentView> list(Integer page, Integer size, String keyword,
                                        String dateFrom, String dateTo, Long supplierId, Long accountId) {
        ValidationRules.requirePaging(page, size);
        LocalDate from = dateFrom == null || dateFrom.isBlank() ? null : ValidationRules.parseDate(dateFrom, "dateFrom");
        LocalDate to = dateTo == null || dateTo.isBlank() ? null : ValidationRules.parseDate(dateTo, "dateTo");
        if (from != null && to != null && from.isAfter(to)) {
            throw ValidationRules.invalid("dateFrom", "起始日期不能晚于结束日期");
        }
        long pageNo = page == null ? 1 : page;
        long pageSize = size == null ? 20 : size;
        String kw = keyword == null ? null : keyword.trim();
        Page<Payment> result = paymentMapper.selectPage(new Page<>(pageNo, pageSize),
                new QueryWrapper<Payment>()
                        .and(kw != null && !kw.isEmpty(), w -> w.like("payment_no", kw)
                                .or().like("external_ref", kw).or().like("remark", kw))
                        .ge(from != null, "payment_date", from)
                        .le(to != null, "payment_date", to)
                        .eq(supplierId != null, "supplier_id", supplierId)
                        .eq(accountId != null, "account_id", accountId)
                        .orderByDesc("payment_date")
                        .orderByDesc("id"));
        return PageResult.of(toViews(result.getRecords()), result.getTotal(), (int) pageNo, (int) pageSize);
    }

    public PaymentView get(long id) {
        Payment payment = paymentMapper.selectById(id);
        if (payment == null) {
            throw BusinessException.notFound("付款单");
        }
        return toViews(List.of(payment)).get(0);
    }

    /**
     * 撤销付款单：保留原单据与原核销明细；同事务登记撤销记录 + 反向资金流水（冲回资金流出），
     * 核销明细置 REVERSED，应付余额恢复。
     */
    @Transactional
    public VoidView voidPayment(long id, VoidRequest request) {
        Payment payment = paymentMapper.selectByIdForUpdate(id);
        if (payment == null) {
            throw BusinessException.notFound("付款单");
        }
        if ("VOIDED".equals(payment.getStatus())) {
            throw BusinessException.conflict("付款单已撤销，禁止重复撤销：" + payment.getPaymentNo());
        }
        LocalDate voidDate = ValidationRules.parseDate(request.voidDate(), "voidDate");
        ValidationRules.requireNotAfter(voidDate, businessTime.today(), "voidDate");
        if (voidDate.isBefore(payment.getPaymentDate())) {
            throw ValidationRules.invalid("voidDate",
                    "撤销日期不能早于原业务日期（" + payment.getPaymentDate() + "）");
        }
        String reason = ValidationRules.text(request.reason(), "reason", 500, false);
        FundFlowPort.VoidOutcome outcome = fundFlowPort.reverseFundDocument(DOC_TYPE, id,
                payment.getPaymentNo(), voidDate, reason);

        for (PaymentAllocation allocation : allocationMapper.selectByPayment(id)) {
            if (!ALLOCATION_ACTIVE.equals(allocation.getStatus())) {
                continue;
            }
            PaymentAllocation update = new PaymentAllocation();
            update.setId(allocation.getId());
            update.setStatus(ALLOCATION_REVERSED);
            update.setReversedVoidRecordId(outcome.voidRecordId());
            allocationMapper.updateById(update);
        }

        Payment update = new Payment();
        update.setId(id);
        update.setStatus("VOIDED");
        update.setVoidRecordId(outcome.voidRecordId());
        paymentMapper.updateById(update);

        return new VoidView(outcome.voidRecordId(), outcome.voidNo(), DOC_TYPE, id, payment.getPaymentNo(),
                voidDate.toString(), reason, List.of(), List.of(), null, null);
    }

    /* ------------------------------ 内部实现 ------------------------------ */

    private SupplierDirectoryApi.SupplierInfo customerOrSupplier(long supplierId) {
        return supplierDirectory.findSupplier(supplierId)
                .orElseThrow(() -> BusinessException.notFound("供应商"));
    }

    private List<AllocationLine> parseLines(List<PayableAllocationRequest> raw) {
        if (raw == null || raw.isEmpty()) {
            throw ValidationRules.invalid("allocations", "至少需要一条核销明细（本阶段不支持未分配付款与预付款）");
        }
        Set<Long> seen = new LinkedHashSet<>();
        List<AllocationLine> lines = new ArrayList<>();
        for (PayableAllocationRequest item : raw) {
            if (item.payableId() == null) {
                throw ValidationRules.invalid("allocations", "核销明细的应付单 id 必填");
            }
            if (!seen.add(item.payableId())) {
                throw ValidationRules.invalid("allocations", "同一应付单不能重复出现在核销明细中");
            }
            lines.add(new AllocationLine(item.payableId(),
                    ValidationRules.parseAmount(item.amount(), "allocations")));
        }
        return lines;
    }

    private static String allocationFingerprint(List<AllocationLine> lines) {
        StringBuilder sb = new StringBuilder();
        for (AllocationLine line : lines) {
            sb.append(line.payableId()).append(':').append(Money.str(line.amount())).append(';');
        }
        return sb.toString();
    }

    private List<PayableAllocationPreviewView.BusinessErrorView> evaluate(long supplierId, BigDecimal amount,
                                                                          List<AllocationLine> lines,
                                                                          boolean locking) {
        List<PayableAllocationPreviewView.BusinessErrorView> errors = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (AllocationLine line : lines) {
            total = total.add(line.amount());
        }
        if (total.compareTo(amount) > 0) {
            errors.add(new PayableAllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                    "核销金额合计（" + Money.str(total) + "）不能超过付款金额（" + Money.str(amount) + "）"));
        }
        List<AllocationLine> ordered = new ArrayList<>(lines);
        ordered.sort(Comparator.comparingLong(AllocationLine::payableId));
        for (AllocationLine line : ordered) {
            Payable payable = locking
                    ? payableMapper.selectByIdForUpdate(line.payableId())
                    : payableMapper.selectById(line.payableId());
            if (payable == null) {
                errors.add(new PayableAllocationPreviewView.BusinessErrorView("NOT_FOUND",
                        "应付单不存在：" + line.payableId()));
                continue;
            }
            if (!"CONFIRMED".equals(payable.getStatus())) {
                errors.add(new PayableAllocationPreviewView.BusinessErrorView("CONFLICT",
                        "应付单已撤销，不可付款：" + payable.getPayableNo()));
                continue;
            }
            if (payable.getSupplierId() == null || payable.getSupplierId() != supplierId) {
                errors.add(new PayableAllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                        "不允许跨供应商核销：应付单 " + payable.getPayableNo() + " 不属于所选供应商"));
                continue;
            }
            if (payable.getFundedExpenseId() != null) {
                errors.add(new PayableAllocationPreviewView.BusinessErrorView("CONFLICT",
                        "应付单 " + payable.getPayableNo() + " 已由采购支出单直接支付，禁止重复付款扣减资金"));
                continue;
            }
            BigDecimal outstanding = payable.getAmount()
                    .subtract(payableMapper.selectActiveAllocatedSum(payable.getId()));
            if (line.amount().compareTo(outstanding) > 0) {
                errors.add(new PayableAllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                        "核销金额超过应付单剩余未付余额：" + payable.getPayableNo()
                                + "（剩余 " + Money.str(outstanding) + "）"));
            }
        }
        if (errors.isEmpty() && total.compareTo(amount) < 0) {
            errors.add(new PayableAllocationPreviewView.BusinessErrorView("VALIDATION_ERROR",
                    "本阶段仅支持全额核销：核销合计必须等于付款金额（未分配付款与预付款暂不实现）"));
        }
        return errors;
    }

    private PayableAllocationPreviewView toPreview(List<AllocationLine> lines, BigDecimal amount,
                                                   List<PayableAllocationPreviewView.BusinessErrorView> errors) {
        BigDecimal total = BigDecimal.ZERO;
        List<PayableAllocationRequest> echo = new ArrayList<>();
        for (AllocationLine line : lines) {
            total = total.add(line.amount());
            echo.add(new PayableAllocationRequest(line.payableId(), Money.str(line.amount())));
        }
        BigDecimal unallocated = amount.subtract(total);
        if (unallocated.signum() < 0) {
            unallocated = BigDecimal.ZERO;
        }
        return new PayableAllocationPreviewView(echo, Money.str(total), Money.str(unallocated), errors);
    }

    private BusinessException allocationErrors(List<PayableAllocationPreviewView.BusinessErrorView> errors) {
        PayableAllocationPreviewView.BusinessErrorView first = errors.get(0);
        ErrorCode code = "CONFLICT".equals(first.code()) ? ErrorCode.CONFLICT : ErrorCode.VALIDATION_ERROR;
        return new BusinessException(code, first.message(),
                Map.of("fieldErrors", Map.of("allocations", first.message())));
    }

    private Payment insertPayment(long supplierId, LocalDate paymentDate, long accountId, BigDecimal amount,
                                  String externalRef, String remark) {
        String paymentNo = docNoGenerator.nextPaymentNo(paymentDate);
        for (int attempt = 0; ; attempt++) {
            Payment payment = new Payment();
            payment.setPaymentNo(paymentNo);
            payment.setSupplierId(supplierId);
            payment.setPaymentDate(paymentDate);
            payment.setAccountId(accountId);
            payment.setAmount(amount);
            payment.setExternalRef(externalRef);
            payment.setRemark(remark);
            payment.setStatus("CONFIRMED");
            try {
                paymentMapper.insert(payment);
                return payment;
            } catch (DuplicateKeyException duplicate) {
                if (attempt >= DOC_NO_RETRY_LIMIT - 1) {
                    throw BusinessException.conflict("付款单编号并发冲突，请稍后重试");
                }
                paymentNo = docNoGenerator.nextPaymentNoForUpdate(paymentDate);
            }
        }
    }

    private List<PaymentView> toViews(List<Payment> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<Long> paymentIds = rows.stream().map(Payment::getId).toList();
        List<PaymentAllocation> allocations = allocationMapper.selectByPayments(paymentIds);

        Set<Long> payableIds = new LinkedHashSet<>();
        allocations.forEach(a -> payableIds.add(a.getPayableId()));
        Map<Long, String> payableNos = new HashMap<>();
        if (!payableIds.isEmpty()) {
            payableMapper.selectBatchIds(payableIds)
                    .forEach(p -> payableNos.put(p.getId(), p.getPayableNo()));
        }
        Map<Long, String> supplierNames = supplierDirectory.supplierNames(
                rows.stream().map(Payment::getSupplierId).distinct().toList());
        Map<Long, String> accountNames = fundFlowPort.accountNames(
                rows.stream().map(Payment::getAccountId).distinct().toList());
        Map<Long, FundFlowPort.VoidInfo> voids = fundFlowPort.voidRecords(DOC_TYPE, paymentIds);
        Map<Long, String> paymentNos = new HashMap<>();
        rows.forEach(paymentRow -> paymentNos.put(paymentRow.getId(), paymentRow.getPaymentNo()));

        Map<Long, List<PaymentAllocationView>> byPayment = new HashMap<>();
        for (PaymentAllocation allocation : allocations) {
            byPayment.computeIfAbsent(allocation.getPaymentId(), key -> new ArrayList<>())
                    .add(new PaymentAllocationView(allocation.getId(), allocation.getPaymentId(),
                            paymentNos.get(allocation.getPaymentId()), allocation.getPayableId(),
                            payableNos.get(allocation.getPayableId()),
                            Money.str(allocation.getAllocationAmount()), allocation.getStatus(),
                            format(allocation.getAllocatedAt())));
        }

        return rows.stream().map(payment -> {
            FundFlowPort.VoidInfo voidInfo = voids.get(payment.getId());
            return new PaymentView(payment.getId(), payment.getPaymentNo(), payment.getSupplierId(),
                    supplierNames.get(payment.getSupplierId()), payment.getPaymentDate().toString(),
                    payment.getAccountId(), accountNames.get(payment.getAccountId()),
                    Money.str(payment.getAmount()), payment.getFundTransactionId(),
                    payment.getFundTransactionId() == null
                            ? null : docNoGenerator.transactionNo(payment.getPaymentNo(), 1),
                    payment.getExternalRef(), payment.getRemark(), payment.getStatus(),
                    payment.getVoidRecordId(),
                    voidInfo == null ? null : voidInfo.voidNo(),
                    voidInfo == null ? null : voidInfo.voidDate(),
                    byPayment.getOrDefault(payment.getId(), List.of()),
                    format(payment.getCreatedAt()), payment.getCreatedBy());
        }).toList();
    }

    private static String format(LocalDateTime time) {
        return time == null ? null : ISO_DATETIME.format(time);
    }
}
