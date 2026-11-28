package com.factoryfinance.modules.payable.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.common.money.Money;
import com.factoryfinance.common.validation.ValidationRules;
import com.factoryfinance.infrastructure.idempotency.IdempotencyGuard;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.masterdata.api.SupplierDirectoryApi;
import com.factoryfinance.modules.payable.api.PayableReportingApi;
import com.factoryfinance.modules.payable.api.dto.CreatePayableRequest;
import com.factoryfinance.modules.payable.api.dto.PayableView;
import com.factoryfinance.modules.payable.domain.Payable;
import com.factoryfinance.modules.payable.domain.PayableStatus;
import com.factoryfinance.modules.payable.infrastructure.mapper.PayableMapper;
import com.factoryfinance.modules.payable.infrastructure.mapper.PaymentAllocationMapper;
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
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 应付单用例（事务边界）。
 *
 * <p>确认应付单只登记债务，<b>不立即扣减资金</b>；已付/未付/状态由有效付款核销派生。
 * 关联 Phase 1 采购支出单（fundedExpenseId）时视为已由支出单直接支付，
 * 该应付单禁止再次付款（防止同一笔采购付款重复扣减资金）。</p>
 */
@Service
public class PayableService implements PayableReportingApi {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String OPERATION = "PAYABLE_CREATE";
    private static final String DOC_TYPE = "PAYABLE";
    private static final int DOC_NO_RETRY_LIMIT = 3;

    private final PayableMapper payableMapper;
    private final PaymentAllocationMapper allocationMapper;
    private final SupplierDirectoryApi supplierDirectory;
    private final PayableDocNoGenerator docNoGenerator;
    private final FundFlowPort fundFlowPort;
    private final BusinessTime businessTime;
    private final IdempotencyGuard idempotency;

    public PayableService(PayableMapper payableMapper,
                          PaymentAllocationMapper allocationMapper,
                          SupplierDirectoryApi supplierDirectory,
                          PayableDocNoGenerator docNoGenerator,
                          FundFlowPort fundFlowPort,
                          BusinessTime businessTime,
                          IdempotencyGuard idempotency) {
        this.payableMapper = payableMapper;
        this.allocationMapper = allocationMapper;
        this.supplierDirectory = supplierDirectory;
        this.docNoGenerator = docNoGenerator;
        this.fundFlowPort = fundFlowPort;
        this.businessTime = businessTime;
        this.idempotency = idempotency;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PayableView create(CreatePayableRequest request) {
        LocalDate today = businessTime.today();
        long supplierId = request.supplierId();
        SupplierDirectoryApi.SupplierInfo supplier = supplierDirectory.findSupplier(supplierId)
                .orElseThrow(() -> BusinessException.notFound("供应商"));
        if (!supplier.enabled()) {
            throw ValidationRules.invalid("supplierId", "供应商已停用，禁止新建应付单");
        }
        LocalDate bizDate = ValidationRules.parseDate(request.bizDate(), "bizDate");
        ValidationRules.requireNotAfter(bizDate, today, "bizDate");
        String accountingMonth = ValidationRules.parseMonth(request.accountingMonth(), "accountingMonth");
        if (accountingMonth == null) {
            accountingMonth = YearMonth.from(bizDate).toString();
        }
        if (accountingMonth.compareTo(YearMonth.from(today).toString()) > 0) {
            throw ValidationRules.invalid("accountingMonth", "所属月份不能晚于当前会计月份");
        }
        LocalDate dueDate = request.dueDate() == null || request.dueDate().isBlank()
                ? null : ValidationRules.parseDate(request.dueDate(), "dueDate");
        if (dueDate != null && dueDate.isBefore(bizDate)) {
            throw ValidationRules.invalid("dueDate", "到期日期不能早于业务日期");
        }
        BigDecimal amount = ValidationRules.parseAmount(request.amount(), "amount");
        String content = ValidationRules.text(request.content(), "content", 255, true);
        String remark = ValidationRules.text(request.remark(), "remark", 500, false);

        Long fundedExpenseId = request.fundedExpenseId();
        if (fundedExpenseId != null) {
            FundFlowPort.PurchasePaymentInfo info = fundFlowPort.findConfirmedPurchaseExpense(fundedExpenseId)
                    .orElseThrow(() -> ValidationRules.invalid("fundedExpenseId",
                            "关联的采购支出单不存在或未确认支付"));
            if (info.amount().compareTo(amount) != 0) {
                throw ValidationRules.invalid("fundedExpenseId",
                        "关联采购支出金额（" + Money.str(info.amount()) + "）必须等于应付金额（"
                                + Money.str(amount) + "）");
            }
        }

        String idemKey = idempotency.requireKey(request.idempotencyKey());
        String fingerprint = idempotency.fingerprint(DOC_TYPE, String.valueOf(supplierId), bizDate.toString(),
                accountingMonth, dueDate == null ? null : dueDate.toString(), Money.str(amount), content,
                remark, fundedExpenseId == null ? null : String.valueOf(fundedExpenseId));
        IdempotencyGuard.Reservation reservation = idempotency.reserve(OPERATION, idemKey, fingerprint);
        if (reservation.existing()) {
            return get(reservation.requireDocId());
        }

        Payable doc = insertDocument(supplierId, bizDate, accountingMonth, dueDate, amount, content, remark,
                fundedExpenseId);
        idempotency.bind(reservation, DOC_TYPE, doc.getId());
        return toView(doc, supplier.name(), paidOf(doc), null);
    }

    /** 应付单列表（关键字/日期/供应商/月份/付款状态） */
    public PageResult<PayableView> list(Integer page, Integer size, String keyword,
                                        String dateFrom, String dateTo, Long supplierId,
                                        String accountingMonth, String paymentStatus) {
        ValidationRules.requirePaging(page, size);
        LocalDate from = dateFrom == null || dateFrom.isBlank() ? null : ValidationRules.parseDate(dateFrom, "dateFrom");
        LocalDate to = dateTo == null || dateTo.isBlank() ? null : ValidationRules.parseDate(dateTo, "dateTo");
        if (from != null && to != null && from.isAfter(to)) {
            throw ValidationRules.invalid("dateFrom", "起始日期不能晚于结束日期");
        }
        String month = ValidationRules.parseMonth(accountingMonth, "accountingMonth");
        PayableStatus status = null;
        if (paymentStatus != null && !paymentStatus.isBlank()) {
            status = PayableStatus.fromCode(paymentStatus.trim())
                    .orElseThrow(() -> ValidationRules.invalid("paymentStatus",
                            "付款状态不合法：应为 UNPAID/PARTIALLY_PAID/SETTLED"));
        }
        long pageNo = page == null ? 1 : page;
        long pageSize = size == null ? 20 : size;
        String kw = keyword == null ? null : keyword.trim();
        List<Payable> rows = payableMapper.selectList(new QueryWrapper<Payable>()
                .and(kw != null && !kw.isEmpty(), w -> w.like("payable_no", kw).or().like("content", kw))
                .ge(from != null, "biz_date", from)
                .le(to != null, "biz_date", to)
                .eq(supplierId != null, "supplier_id", supplierId)
                .eq(month != null, "accounting_month", month)
                .orderByDesc("biz_date")
                .orderByDesc("id"));

        Map<Long, String> supplierNames = supplierDirectory.supplierNames(
                rows.stream().map(Payable::getSupplierId).distinct().toList());
        Map<Long, FundFlowPort.VoidInfo> voids = rows.isEmpty() ? Map.of()
                : fundFlowPort.voidRecords(DOC_TYPE, rows.stream().map(Payable::getId).toList());

        List<PayableView> views = new ArrayList<>();
        for (Payable row : rows) {
            PayableView view = toView(row, supplierNames.get(row.getSupplierId()),
                    paidOf(row), voids.get(row.getId()));
            if (status == null || status.code().equals(view.paymentStatus())) {
                views.add(view);
            }
        }
        int total = views.size();
        int start = (int) Math.min((pageNo - 1) * pageSize, total);
        int end = (int) Math.min(start + pageSize, total);
        return PageResult.of(views.subList(start, end), total, (int) pageNo, (int) pageSize);
    }

    public PayableView get(long id) {
        Payable doc = payableMapper.selectById(id);
        if (doc == null) {
            throw BusinessException.notFound("应付单");
        }
        Map<Long, String> supplierNames = supplierDirectory.supplierNames(List.of(doc.getSupplierId()));
        return toView(doc, supplierNames.get(doc.getSupplierId()), paidOf(doc),
                fundFlowPort.voidRecords(DOC_TYPE, List.of(id)).get(id));
    }

    /**
     * 撤销应付单：已有有效付款核销时拒绝（须先撤销相关付款单）；
     * 应付本身不产生资金流水，撤销只登记可追溯撤销记录并保留原单据。
     */
    @Transactional
    public VoidView voidPayable(long id, VoidRequest request) {
        Payable doc = payableMapper.selectByIdForUpdate(id);
        if (doc == null) {
            throw BusinessException.notFound("应付单");
        }
        if ("VOIDED".equals(doc.getStatus())) {
            throw BusinessException.conflict("应付单已撤销，禁止重复撤销：" + doc.getPayableNo());
        }
        BigDecimal allocated = payableMapper.selectActiveAllocatedSum(id);
        if (allocated != null && allocated.signum() > 0) {
            throw BusinessException.conflict("应付单已有付款核销记录，禁止直接撤销，请先撤销相关付款单："
                    + doc.getPayableNo());
        }
        LocalDate voidDate = ValidationRules.parseDate(request.voidDate(), "voidDate");
        ValidationRules.requireNotAfter(voidDate, businessTime.today(), "voidDate");
        if (voidDate.isBefore(doc.getBizDate())) {
            throw ValidationRules.invalid("voidDate", "撤销日期不能早于原业务日期（" + doc.getBizDate() + "）");
        }
        String reason = ValidationRules.text(request.reason(), "reason", 500, false);
        FundFlowPort.VoidOutcome outcome = fundFlowPort.registerVoidOnly(DOC_TYPE, id, doc.getPayableNo(),
                voidDate, reason);

        Payable update = new Payable();
        update.setId(id);
        update.setStatus("VOIDED");
        update.setVoidRecordId(outcome.voidRecordId());
        payableMapper.updateById(update);

        return new VoidView(outcome.voidRecordId(), outcome.voidNo(), DOC_TYPE, id, doc.getPayableNo(),
                voidDate.toString(), reason, List.of(), List.of(), null, null);
    }

    @Override
    public PayableBalance payableBalance(LocalDate asOf) {
        List<PayableMapper.OutstandingRow> rows = payableMapper.selectOutstandingRows();
        BigDecimal outstanding = BigDecimal.ZERO;
        BigDecimal overdue = BigDecimal.ZERO;
        for (PayableMapper.OutstandingRow row : rows) {
            BigDecimal amount = row.amount() == null ? BigDecimal.ZERO : row.amount();
            BigDecimal allocated = row.allocated() == null ? BigDecimal.ZERO : row.allocated();
            BigDecimal paid = row.fundedExpenseId() == null ? allocated : amount;
            BigDecimal remaining = amount.subtract(paid);
            if (remaining.signum() > 0) {
                outstanding = outstanding.add(remaining);
                if (row.dueDate() != null && row.dueDate().isBefore(asOf)) {
                    overdue = overdue.add(remaining);
                }
            }
        }
        return new PayableBalance(Money.canonical(outstanding), Money.canonical(overdue));
    }

    /** 已付金额（有效付款核销 + 已由支出单直接支付） */
    BigDecimal paidOf(Payable payable) {
        BigDecimal allocated = payableMapper.selectActiveAllocatedSum(payable.getId());
        if (payable.getFundedExpenseId() != null) {
            return payable.getAmount();
        }
        return allocated == null ? BigDecimal.ZERO : allocated;
    }

    private Payable insertDocument(long supplierId, LocalDate bizDate, String accountingMonth,
                                   LocalDate dueDate, BigDecimal amount, String content, String remark,
                                   Long fundedExpenseId) {
        String payableNo = docNoGenerator.nextPayableNo(bizDate);
        for (int attempt = 0; ; attempt++) {
            Payable doc = new Payable();
            doc.setPayableNo(payableNo);
            doc.setSupplierId(supplierId);
            doc.setBizDate(bizDate);
            doc.setAccountingMonth(accountingMonth);
            doc.setDueDate(dueDate);
            doc.setAmount(amount);
            doc.setContent(content);
            doc.setRemark(remark);
            doc.setFundedExpenseId(fundedExpenseId);
            doc.setStatus("CONFIRMED");
            try {
                payableMapper.insert(doc);
                return doc;
            } catch (DuplicateKeyException duplicate) {
                if (attempt >= DOC_NO_RETRY_LIMIT - 1) {
                    throw BusinessException.conflict("应付单编号并发冲突，请稍后重试");
                }
                payableNo = docNoGenerator.nextPayableNoForUpdate(bizDate);
            }
        }
    }

    private PayableView toView(Payable doc, String supplierName, BigDecimal paidAmount,
                               FundFlowPort.VoidInfo voidInfo) {
        BigDecimal amount = doc.getAmount() == null ? BigDecimal.ZERO : doc.getAmount();
        BigDecimal paid = paidAmount == null ? BigDecimal.ZERO : paidAmount;
        BigDecimal outstanding = amount.subtract(paid);
        if (outstanding.signum() < 0) {
            outstanding = BigDecimal.ZERO;
        }
        PayableStatus paymentStatus = PayableStatus.derive(amount, paid);
        return new PayableView(doc.getId(), doc.getPayableNo(), doc.getSupplierId(), supplierName,
                doc.getBizDate().toString(), doc.getAccountingMonth(),
                doc.getDueDate() == null ? null : doc.getDueDate().toString(),
                Money.str(amount), Money.str(paid), Money.str(outstanding), paymentStatus.code(),
                doc.getContent(), doc.getRemark(), doc.getFundedExpenseId(), doc.getStatus(),
                doc.getVoidRecordId(),
                voidInfo == null ? null : voidInfo.voidNo(),
                voidInfo == null ? null : voidInfo.voidDate(),
                format(doc.getCreatedAt()), doc.getCreatedBy());
    }

    private static String format(LocalDateTime time) {
        return time == null ? null : ISO_DATETIME.format(time);
    }

    /** 供付款服务复用：应付单有效付款核销合计 */
    BigDecimal activeAllocated(long payableId) {
        BigDecimal allocated = payableMapper.selectActiveAllocatedSum(payableId);
        return allocated == null ? BigDecimal.ZERO : allocated;
    }

    /** 供付款服务复用：应付单剩余未付金额 */
    BigDecimal outstandingOf(long payableId) {
        Payable payable = payableMapper.selectById(payableId);
        if (payable == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal remaining = payable.getAmount().subtract(paidOf(payable));
        return remaining.signum() < 0 ? BigDecimal.ZERO : remaining;
    }

    /** 供付款服务复用：客户/供应商名称映射工具（避免重复实现批量查询） */
    Map<Long, String> supplierNames(List<Long> ids) {
        return new HashMap<>(supplierDirectory.supplierNames(ids));
    }
}
