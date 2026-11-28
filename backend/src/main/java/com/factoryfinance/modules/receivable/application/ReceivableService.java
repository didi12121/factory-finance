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
import com.factoryfinance.modules.receivable.api.ReceivableReportingApi;
import com.factoryfinance.modules.receivable.api.dto.CreateReceivableRequest;
import com.factoryfinance.modules.receivable.api.dto.ReceivableView;
import com.factoryfinance.modules.receivable.domain.Receivable;
import com.factoryfinance.modules.receivable.domain.ReceivableStatus;
import com.factoryfinance.modules.receivable.infrastructure.mapper.ReceiptAllocationMapper;
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
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 应收单用例（事务边界）。
 *
 * <p>确认应收单只登记债权，<b>不产生资金流水、不增加实际资金余额</b>；
 * 已收/未收/回款状态/逾期由有效核销明细派生。</p>
 *
 * <p>业务日期规则：对账日期与所属会计月份均不得晚于当前业务日期/会计月份
 * （禁止未来日期或未来月份提前确认收入）；到期日不得早于对账日期。</p>
 *
 * <p>撤销规则：已有有效回款核销的应收单禁止直接撤销（须先处理核销关系）；
 * 撤销只登记可追溯撤销记录（应收本身无资金流水），原单据保留。</p>
 */
@Service
public class ReceivableService implements ReceivableReportingApi {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String OPERATION = "RECEIVABLE_CREATE";
    private static final String DOC_TYPE = "RECEIVABLE";
    private static final int DOC_NO_RETRY_LIMIT = 3;

    private final ReceivableMapper receivableMapper;
    private final ReceiptAllocationMapper allocationMapper;
    private final CustomerDirectoryApi customerDirectory;
    private final ReceivableDocNoGenerator docNoGenerator;
    private final FundFlowPort fundFlowPort;
    private final BusinessTime businessTime;
    private final IdempotencyGuard idempotency;

    public ReceivableService(ReceivableMapper receivableMapper,
                             ReceiptAllocationMapper allocationMapper,
                             CustomerDirectoryApi customerDirectory,
                             ReceivableDocNoGenerator docNoGenerator,
                             FundFlowPort fundFlowPort,
                             BusinessTime businessTime,
                             IdempotencyGuard idempotency) {
        this.receivableMapper = receivableMapper;
        this.allocationMapper = allocationMapper;
        this.customerDirectory = customerDirectory;
        this.docNoGenerator = docNoGenerator;
        this.fundFlowPort = fundFlowPort;
        this.businessTime = businessTime;
        this.idempotency = idempotency;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReceivableView create(CreateReceivableRequest request) {
        LocalDate today = businessTime.today();
        long customerId = request.customerId();
        CustomerDirectoryApi.CustomerInfo customer = customerDirectory.findCustomer(customerId)
                .orElseThrow(() -> BusinessException.notFound("客户"));
        if (!customer.enabled()) {
            throw ValidationRules.invalid("customerId", "客户已停用，禁止新建应收单");
        }
        String accountingMonth = ValidationRules.parseMonth(request.accountingMonth(), "accountingMonth");
        if (accountingMonth == null) {
            throw ValidationRules.invalid("accountingMonth", "所属月份必填（YYYY-MM）");
        }
        if (accountingMonth.compareTo(YearMonth.from(today).toString()) > 0) {
            throw ValidationRules.invalid("accountingMonth", "所属月份不能晚于当前会计月份（禁止提前确认收入）");
        }
        LocalDate statementDate = ValidationRules.parseDate(request.statementDate(), "statementDate");
        ValidationRules.requireNotAfter(statementDate, today, "statementDate");
        LocalDate dueDate = request.dueDate() == null || request.dueDate().isBlank()
                ? null
                : ValidationRules.parseDate(request.dueDate(), "dueDate");
        if (dueDate != null && dueDate.isBefore(statementDate)) {
            throw ValidationRules.invalid("dueDate", "到期日期不能早于对账日期");
        }
        BigDecimal amount = ValidationRules.parseAmount(request.amount(), "amount");
        String remark = ValidationRules.text(request.remark(), "remark", 500, false);

        String idemKey = idempotency.requireKey(request.idempotencyKey());
        String fingerprint = idempotency.fingerprint(DOC_TYPE, String.valueOf(customerId), accountingMonth,
                statementDate.toString(), dueDate == null ? null : dueDate.toString(),
                Money.str(amount), remark);
        IdempotencyGuard.Reservation reservation = idempotency.reserve(OPERATION, idemKey, fingerprint);
        if (reservation.existing()) {
            return get(reservation.requireDocId());
        }

        Receivable doc = insertDocument(customerId, accountingMonth, statementDate, dueDate, amount, remark);
        idempotency.bind(reservation, DOC_TYPE, doc.getId());
        return toView(doc, customer.name(), BigDecimal.ZERO, today, null);
    }

    /** 应收单列表（关键字/日期范围/客户/所属月份/回款状态/仅逾期） */
    public PageResult<ReceivableView> list(Integer page, Integer size, String keyword,
                                           String dateFrom, String dateTo, Long customerId,
                                           String accountingMonth, String paymentStatus, Boolean overdueOnly) {
        ValidationRules.requirePaging(page, size);
        LocalDate from = dateFrom == null || dateFrom.isBlank() ? null : ValidationRules.parseDate(dateFrom, "dateFrom");
        LocalDate to = dateTo == null || dateTo.isBlank() ? null : ValidationRules.parseDate(dateTo, "dateTo");
        if (from != null && to != null && from.isAfter(to)) {
            throw ValidationRules.invalid("dateFrom", "起始日期不能晚于结束日期");
        }
        String month = ValidationRules.parseMonth(accountingMonth, "accountingMonth");
        ReceivableStatus parsedStatus = null;
        if (paymentStatus != null && !paymentStatus.isBlank()) {
            parsedStatus = ReceivableStatus.fromCode(paymentStatus.trim())
                    .orElseThrow(() -> ValidationRules.invalid("paymentStatus",
                            "回款状态不合法：应为 UNPAID/PARTIALLY_PAID/SETTLED"));
        }
        final ReceivableStatus status = parsedStatus;

        long pageNo = page == null ? 1 : page;
        long pageSize = size == null ? 20 : size;
        String kw = keyword == null ? null : keyword.trim();
        QueryWrapper<Receivable> wrapper = new QueryWrapper<Receivable>()
                .and(kw != null && !kw.isEmpty(), w -> w.like("statement_no", kw).or().like("remark", kw))
                .ge(from != null, "statement_date", from)
                .le(to != null, "statement_date", to)
                .eq(customerId != null, "customer_id", customerId)
                .eq(month != null, "accounting_month", month)
                .orderByDesc("statement_date")
                .orderByDesc("id");

        // 回款状态/逾期为派生属性：先取满足基础条件的全量派生存款，再内存过滤分页
        List<Receivable> rows = receivableMapper.selectList(wrapper);
        LocalDate today = businessTime.today();
        Map<Long, BigDecimal> allocated = allocatedByReceivable(rows);
        Map<Long, FundFlowPort.VoidInfo> voids = voidRecordsOf(rows);
        List<ReceivableView> views = rows.stream()
                .map(row -> toView(row, customerNames(List.of(row.getCustomerId())),
                        allocated.getOrDefault(row.getId(), BigDecimal.ZERO), today, voids.get(row.getId())))
                .filter(view -> status == null || status.code().equals(view.paymentStatus()))
                .filter(view -> !Boolean.TRUE.equals(overdueOnly) || view.overdue())
                .toList();
        int total = views.size();
        int start = (int) Math.min((pageNo - 1) * pageSize, total);
        int end = (int) Math.min(start + pageSize, total);
        return PageResult.of(views.subList(start, end), total, (int) pageNo, (int) pageSize);
    }

    /** 应收单详情 */
    public ReceivableView get(long id) {
        Receivable doc = receivableMapper.selectById(id);
        if (doc == null) {
            throw BusinessException.notFound("应收单");
        }
        BigDecimal allocated = allocationMapper.selectActiveSum(id);
        return toView(doc, customerNames(List.of(doc.getCustomerId())), allocated, businessTime.today(),
                fundFlowPort.voidRecords(DOC_TYPE, List.of(id)).get(id));
    }

    /**
     * 撤销应收单：已有有效回款核销时拒绝（须先撤销相关收款单）；
     * 撤销保留原单据并登记可追溯撤销记录（应收本身不产生资金流水，故无反向流水）。
     */
    @Transactional
    public VoidView voidReceivable(long id, VoidRequest request) {
        Receivable doc = receivableMapper.selectByIdForUpdate(id);
        if (doc == null) {
            throw BusinessException.notFound("应收单");
        }
        if ("VOIDED".equals(doc.getStatus())) {
            throw BusinessException.conflict("应收单已撤销，禁止重复撤销：" + doc.getStatementNo());
        }
        BigDecimal allocated = receivableMapper.selectActiveAllocatedSum(id);
        if (allocated != null && allocated.signum() > 0) {
            throw BusinessException.conflict("应收单已有回款核销记录，禁止直接撤销，请先撤销相关收款单："
                    + doc.getStatementNo());
        }
        LocalDate voidDate = ValidationRules.parseDate(request.voidDate(), "voidDate");
        ValidationRules.requireNotAfter(voidDate, businessTime.today(), "voidDate");
        if (voidDate.isBefore(doc.getStatementDate())) {
            throw ValidationRules.invalid("voidDate", "撤销日期不能早于原业务日期（" + doc.getStatementDate() + "）");
        }
        String reason = ValidationRules.text(request.reason(), "reason", 500, false);
        FundFlowPort.VoidOutcome outcome = fundFlowPort.registerVoidOnly(DOC_TYPE, id, doc.getStatementNo(),
                voidDate, reason);

        Receivable update = new Receivable();
        update.setId(id);
        update.setStatus("VOIDED");
        update.setVoidRecordId(outcome.voidRecordId());
        receivableMapper.updateById(update);

        return new VoidView(outcome.voidRecordId(), outcome.voidNo(), DOC_TYPE, id, doc.getStatementNo(),
                voidDate.toString(), reason, List.of(), List.of(), null, null);
    }

    @Override
    public ReceivableBalance receivableBalance(LocalDate asOf) {
        List<ReceivableMapper.OutstandingRow> rows = receivableMapper.selectOutstandingRows();
        BigDecimal outstanding = BigDecimal.ZERO;
        BigDecimal overdueOutstanding = BigDecimal.ZERO;
        BigDecimal confirmedTotal = BigDecimal.ZERO;
        for (ReceivableMapper.OutstandingRow row : rows) {
            BigDecimal original = row.originalAmount() == null ? BigDecimal.ZERO : row.originalAmount();
            BigDecimal allocated = row.allocated() == null ? BigDecimal.ZERO : row.allocated();
            BigDecimal remaining = original.subtract(allocated);
            confirmedTotal = confirmedTotal.add(original);
            if (remaining.signum() > 0) {
                outstanding = outstanding.add(remaining);
                if (row.dueDate() != null && row.dueDate().isBefore(asOf)) {
                    overdueOutstanding = overdueOutstanding.add(remaining);
                }
            }
        }
        return new ReceivableBalance(Money.canonical(outstanding), Money.canonical(overdueOutstanding),
                Money.canonical(confirmedTotal));
    }

    private Receivable insertDocument(long customerId, String accountingMonth, LocalDate statementDate,
                                      LocalDate dueDate, BigDecimal amount, String remark) {
        String docNo = docNoGenerator.nextStatementNo(statementDate);
        for (int attempt = 0; ; attempt++) {
            Receivable doc = new Receivable();
            doc.setStatementNo(docNo);
            doc.setCustomerId(customerId);
            doc.setAccountingMonth(accountingMonth);
            doc.setStatementDate(statementDate);
            doc.setDueDate(dueDate);
            doc.setOriginalAmount(amount);
            doc.setRemark(remark);
            doc.setStatus("CONFIRMED");
            try {
                receivableMapper.insert(doc);
                return doc;
            } catch (DuplicateKeyException duplicate) {
                if (attempt >= DOC_NO_RETRY_LIMIT - 1) {
                    throw BusinessException.conflict("对账单编号并发冲突，请稍后重试");
                }
                docNo = docNoGenerator.nextStatementNoForUpdate(statementDate);
            }
        }
    }

    private Map<Long, BigDecimal> allocatedByReceivable(List<Receivable> rows) {
        Map<Long, BigDecimal> result = new HashMap<>();
        List<Long> ids = new ArrayList<>();
        for (Receivable row : rows) {
            ids.add(row.getId());
        }
        if (ids.isEmpty()) {
            return result;
        }
        allocationMapper.selectActiveSums(ids).forEach(row ->
                result.put(row.receivableId(), row.allocated() == null ? BigDecimal.ZERO : row.allocated()));
        return result;
    }

    private String customerNames(List<Long> customerIds) {
        Map<Long, String> names = customerDirectory.customerNames(customerIds);
        return names.isEmpty() ? null : names.get(customerIds.get(0));
    }

    private Map<Long, FundFlowPort.VoidInfo> voidRecordsOf(List<Receivable> rows) {
        List<Long> ids = rows.stream().map(Receivable::getId).toList();
        return ids.isEmpty() ? Map.of() : fundFlowPort.voidRecords(DOC_TYPE, ids);
    }

    private ReceivableView toView(Receivable doc, String customerName, BigDecimal allocated, LocalDate asOf,
                                  FundFlowPort.VoidInfo voidInfo) {
        BigDecimal original = doc.getOriginalAmount() == null ? BigDecimal.ZERO : doc.getOriginalAmount();
        BigDecimal paid = allocated == null ? BigDecimal.ZERO : allocated;
        BigDecimal outstanding = original.subtract(paid);
        if (outstanding.signum() < 0) {
            outstanding = BigDecimal.ZERO;
        }
        ReceivableStatus paymentStatus = ReceivableStatus.derive(original, paid);
        boolean overdue = doc.getDueDate() != null
                && doc.getDueDate().isBefore(asOf)
                && paymentStatus != ReceivableStatus.SETTLED;
        return new ReceivableView(doc.getId(), doc.getStatementNo(), doc.getCustomerId(), customerName,
                doc.getAccountingMonth(), doc.getStatementDate().toString(),
                doc.getDueDate() == null ? null : doc.getDueDate().toString(),
                Money.str(original), Money.str(paid), Money.str(outstanding),
                paymentStatus.code(), overdue, doc.getStatus(), doc.getRemark(), doc.getVoidRecordId(),
                voidInfo == null ? null : voidInfo.voidNo(),
                voidInfo == null ? null : voidInfo.voidDate(),
                format(doc.getCreatedAt()), doc.getCreatedBy());
    }

    private static String format(LocalDateTime time) {
        return time == null ? null : ISO_DATETIME.format(time);
    }
}
