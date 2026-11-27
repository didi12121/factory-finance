package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.treasury.api.dto.CreateExpenseRequest;
import com.factoryfinance.modules.treasury.api.dto.ExpenseView;
import com.factoryfinance.modules.treasury.domain.DocSeries;
import com.factoryfinance.modules.treasury.domain.DocStatus;
import com.factoryfinance.modules.treasury.domain.Expense;
import com.factoryfinance.modules.treasury.domain.ExpenseCategory;
import com.factoryfinance.modules.treasury.domain.FundAccount;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import com.factoryfinance.modules.treasury.domain.TxnDirection;
import com.factoryfinance.modules.treasury.domain.TxnStatus;
import com.factoryfinance.modules.treasury.domain.TxnType;
import com.factoryfinance.modules.treasury.domain.VoidRecord;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ExpenseMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
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
 * 日常支出用例（事务边界）。
 * 确认支出 = 业务单据 + OUT 资金流水同事务提交；仅记录已实际支付的支出。
 * 资金支出 ≠ 会计费用（Dashboard 口径标注"资金支出"）。
 * 幂等：单据编号唯一键 + uk_tst_fund_txn_source 数据库级拦截，DuplicateKeyException → 409。
 */
@Service
public class ExpenseService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final ExpenseMapper expenseMapper;
    private final FundTransactionMapper transactionMapper;
    private final AccountLookup accountLookup;
    private final DocNoGenerator docNoGenerator;
    private final VoidLookup voidLookup;
    private final BusinessTime businessTime;

    public ExpenseService(ExpenseMapper expenseMapper,
                          FundTransactionMapper transactionMapper,
                          AccountLookup accountLookup,
                          DocNoGenerator docNoGenerator,
                          VoidLookup voidLookup,
                          BusinessTime businessTime) {
        this.expenseMapper = expenseMapper;
        this.transactionMapper = transactionMapper;
        this.accountLookup = accountLookup;
        this.docNoGenerator = docNoGenerator;
        this.voidLookup = voidLookup;
        this.businessTime = businessTime;
    }

    @Transactional
    public ExpenseView create(CreateExpenseRequest request) {
        ExpenseCategory category = ExpenseCategory.fromCode(
                        request.category() == null ? "" : request.category().trim())
                .orElseThrow(() -> TreasuryValidation.invalid("category",
                        "支出分类不合法：应为 PURCHASE/SALARY/ELECTRICITY/WATER/INTERNET/RENT/SUPPLIES/REPAIR/TRANSPORT/OTHER 之一"));
        String content = TreasuryValidation.text(request.content(), "content", 255, true);
        String bizMonth = TreasuryValidation.parseMonth(request.bizMonth(), "bizMonth");
        LocalDate payDate = TreasuryValidation.parseDate(request.payDate(), "payDate");
        TreasuryValidation.requireNotAfterToday(businessTime, payDate, "payDate");
        BigDecimal amount = TreasuryValidation.parseAmount(request.amount(), "amount");
        String payee = TreasuryValidation.text(request.payee(), "payee", 128, false);
        String remark = TreasuryValidation.text(request.remark(), "remark", 500, false);
        String attachmentRef = TreasuryValidation.text(request.attachmentRef(), "attachmentRef", 255, false);
        String clientDocNo = TreasuryValidation.docNo(request.docNo(), DocSeries.EXPENSE.prefix());
        FundAccount account = accountLookup.requireEnabled(request.accountId());

        String employeeName = null;
        String salaryMonth = null;
        if (category == ExpenseCategory.SALARY) {
            employeeName = TreasuryValidation.text(request.employeeName(), "employeeName", 64, true);
            salaryMonth = TreasuryValidation.parseMonth(request.salaryMonth(), "salaryMonth");
            if (salaryMonth == null) {
                throw TreasuryValidation.invalid("salaryMonth", "工资支出必须填写工资月份（YYYY-MM）");
            }
        } else {
            employeeName = TreasuryValidation.text(request.employeeName(), "employeeName", 64, false);
            salaryMonth = TreasuryValidation.parseMonth(request.salaryMonth(), "salaryMonth");
        }

        String docNo = clientDocNo != null ? clientDocNo : docNoGenerator.next(DocSeries.EXPENSE, payDate);
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                Expense doc = new Expense();
                doc.setDocNo(docNo);
                doc.setCategory(category.code());
                doc.setContent(content);
                doc.setBizMonth(bizMonth);
                doc.setPayDate(payDate);
                doc.setAccountId(account.getId());
                doc.setAmount(amount);
                doc.setPayee(payee);
                doc.setEmployeeName(employeeName);
                doc.setSalaryMonth(salaryMonth);
                doc.setAttachmentRef(attachmentRef);
                doc.setRemark(remark);
                doc.setStatus(DocStatus.CONFIRMED.code());
                expenseMapper.insert(doc);

                FundTransaction txn = new FundTransaction();
                txn.setTransactionNo(docNoGenerator.transactionNo(docNo, 1));
                txn.setTransactionType(TxnType.EXPENSE.code());
                txn.setTradeDate(payDate);
                txn.setAccountId(account.getId());
                txn.setDirection(TxnDirection.OUT.code());
                txn.setAmount(amount);
                txn.setCounterparty(payee);
                txn.setSourceDocType(TxnType.EXPENSE.code());
                txn.setSourceDocId(doc.getId());
                txn.setStatus(TxnStatus.RECORDED.code());
                txn.setRemark(remark);
                transactionMapper.insert(txn);

                return toView(doc, account.getName(), null);
            } catch (DuplicateKeyException duplicate) {
                if (clientDocNo != null) {
                    throw BusinessException.conflict("单据编号已存在，请勿重复提交：" + clientDocNo);
                }
                Expense existing = expenseMapper.selectByDocNoForUpdate(docNo);
                if (existing == null) {
                    throw BusinessException.conflict("提交冲突：资金流水已存在，请勿重复提交");
                }
                if (sameDocument(existing, category, content, bizMonth, payDate, account.getId(), amount,
                        payee, employeeName, salaryMonth, remark)) {
                    throw BusinessException.conflict("重复提交：相同支出单已存在（" + docNo + "）");
                }
                docNo = docNoGenerator.nextForUpdate(DocSeries.EXPENSE, payDate);
            }
        }
        throw BusinessException.conflict("单据编号并发冲突，请稍后重试");
    }

    public PageResult<ExpenseView> list(Integer page, Integer size,
                                        String dateFrom, String dateTo,
                                        String category, Long accountId, String status) {
        TreasuryValidation.requirePaging(page, size);
        LocalDate from = dateFrom == null ? null : TreasuryValidation.parseDate(dateFrom, "dateFrom");
        LocalDate to = dateTo == null ? null : TreasuryValidation.parseDate(dateTo, "dateTo");
        if (from != null && to != null && from.isAfter(to)) {
            throw TreasuryValidation.invalid("dateFrom", "起始日期不能晚于结束日期");
        }
        DocStatus docStatus = parseStatus(status);
        String statusCode = docStatus == null ? null : docStatus.code();
        ExpenseCategory expenseCategory = null;
        if (category != null && !category.isBlank()) {
            expenseCategory = ExpenseCategory.fromCode(category.trim())
                    .orElseThrow(() -> TreasuryValidation.invalid("category", "支出分类不合法"));
        }

        long pageNo = page == null ? 1 : page;
        long pageSize = size == null ? 20 : size;
        Page<Expense> result = expenseMapper.selectPage(new Page<>(pageNo, pageSize),
                new QueryWrapper<Expense>()
                        .ge(from != null, "pay_date", from)
                        .le(to != null, "pay_date", to)
                        .eq(expenseCategory != null, "category",
                                expenseCategory == null ? null : expenseCategory.code())
                        .eq(accountId != null, "account_id", accountId)
                        .eq(docStatus != null, "status", statusCode)
                        .orderByDesc("pay_date")
                        .orderByDesc("id"));
        List<ExpenseView> items = toViews(result.getRecords());
        return PageResult.of(items, result.getTotal(), (int) pageNo, (int) pageSize);
    }

    private List<ExpenseView> toViews(List<Expense> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<Long, String> accountNames = accountLookup.names(rows.stream().map(Expense::getAccountId).toList());
        Map<Long, VoidRecord> voids = voidLookup.byTarget(TxnType.EXPENSE.code(),
                rows.stream().map(Expense::getId).toList());
        return rows.stream()
                .map(d -> toView(d, accountNames.get(d.getAccountId()), voids.get(d.getId())))
                .toList();
    }

    private ExpenseView toView(Expense doc, String accountName, VoidRecord voidRecord) {
        return new ExpenseView(
                doc.getId(),
                doc.getDocNo(),
                doc.getCategory(),
                doc.getContent(),
                doc.getBizMonth(),
                doc.getPayDate().toString(),
                doc.getAccountId(),
                accountName,
                Money.str(doc.getAmount()),
                doc.getPayee(),
                doc.getEmployeeName(),
                doc.getSalaryMonth(),
                doc.getAttachmentRef(),
                doc.getRemark(),
                doc.getStatus(),
                doc.getVoidRecordId(),
                voidRecord == null ? null : voidRecord.getVoidNo(),
                voidRecord == null ? null : voidRecord.getVoidDate().toString(),
                doc.getCreatedAt() == null ? null : ISO_DATETIME.format(doc.getCreatedAt()),
                doc.getCreatedBy());
    }

    private static boolean sameDocument(Expense existing, ExpenseCategory category, String content,
                                        String bizMonth, LocalDate payDate, Long accountId,
                                        BigDecimal amount, String payee, String employeeName,
                                        String salaryMonth, String remark) {
        return category.code().equals(existing.getCategory())
                && Objects.equals(existing.getContent(), content)
                && Objects.equals(existing.getBizMonth(), bizMonth)
                && Objects.equals(existing.getPayDate(), payDate)
                && Objects.equals(existing.getAccountId(), accountId)
                && existing.getAmount() != null && existing.getAmount().compareTo(amount) == 0
                && Objects.equals(existing.getPayee(), payee)
                && Objects.equals(existing.getEmployeeName(), employeeName)
                && Objects.equals(existing.getSalaryMonth(), salaryMonth)
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
