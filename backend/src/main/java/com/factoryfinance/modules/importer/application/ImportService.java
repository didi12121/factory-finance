package com.factoryfinance.modules.importer.application;

import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.common.money.Money;
import com.factoryfinance.common.validation.ValidationRules;
import com.factoryfinance.infrastructure.idempotency.IdempotencyGuard;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.importer.api.dto.ImportViews.ImportBatchView;
import com.factoryfinance.modules.importer.api.dto.ImportViews.ImportPreviewView;
import com.factoryfinance.modules.importer.api.dto.ImportViews.ImportRowView;
import com.factoryfinance.modules.importer.domain.ImportBatch;
import com.factoryfinance.modules.importer.domain.ImportBatchRow;
import com.factoryfinance.modules.importer.domain.ImportTemplate;
import com.factoryfinance.modules.importer.infrastructure.mapper.ImportBatchMapper;
import com.factoryfinance.modules.importer.infrastructure.mapper.ImportBatchRowMapper;
import com.factoryfinance.modules.masterdata.api.CustomerDirectoryApi;
import com.factoryfinance.modules.masterdata.api.MasterdataWriteApi;
import com.factoryfinance.modules.masterdata.api.SupplierDirectoryApi;
import com.factoryfinance.modules.masterdata.api.dto.CustomerCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.ShareholderCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.SupplierCreateRequest;
import com.factoryfinance.modules.receivable.api.ReceivableWriteApi;
import com.factoryfinance.modules.receivable.api.dto.CreateReceivableRequest;
import com.factoryfinance.modules.receivable.api.dto.CreateReceiptRequest;
import com.factoryfinance.modules.receivable.api.dto.ReceiptAllocationRequest;
import com.factoryfinance.modules.treasury.api.TreasuryWriteApi;
import com.factoryfinance.modules.treasury.api.dto.CreateAccountRequest;
import com.factoryfinance.modules.treasury.api.dto.CreateContributionRequest;
import com.factoryfinance.modules.treasury.api.dto.CreateExpenseRequest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

/**
 * Excel 数据迁移用例（最小可用流程）：
 * 模板下载 → 上传解析 → 导入前预览与字段校验 → 确认导入 → 批次记录与结果统计。
 *
 * <p>红线：</p>
 * <ul>
 *   <li>全部写入均委托既有业务 Service（主数据/资金/应收/收款），不直写业务表，
 *       因此财务校验、金额精度、事务一致性、资金流水唯一性与原子撤销规则不被绕过；</li>
 *   <li>行级幂等键由「模板 + 行内容」派生：重复确认同一内容行不会重复记账；</li>
 *   <li>同一模板 + 同一文件内容（SHA-256）只允许一个批次（重复导入防护最终防线）；</li>
 *   <li>逐行独立事务：失败行零残留（不产生无法追溯的部分资金记录），成功行记录业务单据主键。</li>
 * </ul>
 */
@Service
public class ImportService {

    private static final DateTimeFormatter ISO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final DateTimeFormatter BATCH_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final String OPERATION_PREFIX = "IMPORT_";

    private final ExcelSheetParser parser;
    private final ExcelTemplateCatalog templateCatalog;
    private final ImportBatchMapper batchMapper;
    private final ImportBatchRowMapper batchRowMapper;
    private final IdempotencyGuard idempotency;
    private final BusinessTime businessTime;
    private final MasterdataWriteApi masterdataWriteApi;
    private final TreasuryWriteApi treasuryWriteApi;
    private final ReceivableWriteApi receivableWriteApi;
    private final CustomerDirectoryApi customerDirectory;
    private final SupplierDirectoryApi supplierDirectory;

    public ImportService(ExcelSheetParser parser,
                         ExcelTemplateCatalog templateCatalog,
                         ImportBatchMapper batchMapper,
                         ImportBatchRowMapper batchRowMapper,
                         IdempotencyGuard idempotency,
                         BusinessTime businessTime,
                         MasterdataWriteApi masterdataWriteApi,
                         TreasuryWriteApi treasuryWriteApi,
                         ReceivableWriteApi receivableWriteApi,
                         CustomerDirectoryApi customerDirectory,
                         SupplierDirectoryApi supplierDirectory) {
        this.parser = parser;
        this.templateCatalog = templateCatalog;
        this.batchMapper = batchMapper;
        this.batchRowMapper = batchRowMapper;
        this.idempotency = idempotency;
        this.businessTime = businessTime;
        this.masterdataWriteApi = masterdataWriteApi;
        this.treasuryWriteApi = treasuryWriteApi;
        this.receivableWriteApi = receivableWriteApi;
        this.customerDirectory = customerDirectory;
        this.supplierDirectory = supplierDirectory;
    }

    /* ------------------------------ 模板 ------------------------------ */

    public List<ImportTemplate> templates() {
        return List.of(ImportTemplate.values());
    }

    public ImportTemplate requireTemplate(String code) {
        return ImportTemplate.of(code)
                .orElseThrow(() -> BusinessException.notFound("导入模板 " + code));
    }

    public byte[] templateFile(ImportTemplate template) {
        return templateCatalog.build(template);
    }

    public String templateFileName(ImportTemplate template) {
        return templateCatalog.fileName(template);
    }

    /* ------------------------------ 预览 ------------------------------ */

    /** 导入前预览：解析 + 逐行校验 + 重复行识别（不落库、不产生业务数据） */
    public ImportPreviewView preview(ImportTemplate template, MultipartFile file) {
        byte[] content = readBytes(file);
        String sha = sha256(content);
        List<ExcelSheetParser.ParsedRow> parsedRows = parser.parse(template, content);
        List<PreparedRow> prepared = prepareRows(template, parsedRows, sha);

        ImportBatch existing = batchMapper.selectByFile(template.name(), sha);
        List<ImportRowView> rows = prepared.stream().map(PreparedRow::toView).toList();
        int invalid = (int) rows.stream().filter(row -> "INVALID".equals(row.status())).count();
        int duplicate = (int) rows.stream().filter(row -> "DUPLICATE".equals(row.status())).count();
        return new ImportPreviewView(template.name(), template.displayName(), fileName(file), sha,
                existing == null ? null : existing.getBatchNo(),
                rows.size(), rows.size() - invalid - duplicate, invalid, duplicate, rows);
    }

    /* ------------------------------ 确认导入 ------------------------------ */

    /**
     * 确认导入：同一文件已导入时直接返回既有批次（幂等，不重复记账）；
     * 否则创建批次并逐行调用业务服务写入。
     */
    public ImportBatchView confirm(ImportTemplate template, MultipartFile file) {
        byte[] content = readBytes(file);
        String sha = sha256(content);

        ImportBatch existing = batchMapper.selectByFile(template.name(), sha);
        if (existing != null) {
            return toView(existing, true);
        }

        List<ExcelSheetParser.ParsedRow> parsedRows = parser.parse(template, content);
        List<PreparedRow> prepared = prepareRows(template, parsedRows, sha);
        ImportBatch batch = createBatch(template, fileName(file), sha, prepared.size());

        int success = 0;
        int failed = 0;
        int duplicate = 0;
        List<ImportBatchRow> rowRecords = new ArrayList<>();
        int rowNo = 0;
        for (PreparedRow row : prepared) {
            rowNo++;
            ImportBatchRow record = new ImportBatchRow();
            record.setBatchId(batch.getId());
            record.setRowNo(rowNo);
            record.setRowData(toRowData(row.values()));
            if (!row.messages().isEmpty()) {
                record.setStatus("FAILED");
                record.setMessage(truncate(String.join("；", row.messages())));
                failed++;
            } else if (row.duplicate() || isDuplicate(row)) {
                record.setStatus("DUPLICATE");
                record.setMessage("与已导入内容重复，已跳过（未重复记账）");
                duplicate++;
            } else {
                try {
                    Long docId = row.executor().get();
                    record.setStatus("SUCCESS");
                    record.setBizDocType(row.docType());
                    record.setBizDocId(docId);
                    success++;
                } catch (DuplicateKeyException duplicateKey) {
                    record.setStatus("DUPLICATE");
                    record.setMessage("已存在相同业务数据（唯一约束拦截），已跳过");
                    duplicate++;
                } catch (BusinessException businessException) {
                    record.setStatus("FAILED");
                    record.setMessage(truncate(businessException.getMessage()));
                    failed++;
                } catch (RuntimeException ex) {
                    record.setStatus("FAILED");
                    record.setMessage(truncate("导入失败：" + ex.getMessage()));
                    failed++;
                }
            }
            batchRowMapper.insert(record);
            rowRecords.add(record);
        }

        ImportBatch update = new ImportBatch();
        update.setId(batch.getId());
        update.setSuccessRows(success);
        update.setFailedRows(failed);
        update.setDuplicateRows(duplicate);
        update.setStatus("IMPORTED");
        update.setImportedAt(java.time.LocalDateTime.now());
        batchMapper.updateById(update);
        batch.setSuccessRows(success);
        batch.setFailedRows(failed);
        batch.setDuplicateRows(duplicate);
        batch.setStatus("IMPORTED");
        batch.setImportedAt(update.getImportedAt());

        List<ImportRowView> rows = new ArrayList<>();
        for (int i = 0; i < prepared.size(); i++) {
            ImportBatchRow record = rowRecords.get(i);
            rows.add(new ImportRowView(record.getRowNo(), prepared.get(i).values(),
                    record.getStatus(), record.getMessage() == null ? List.of() : List.of(record.getMessage()),
                    record.getBizDocType(), record.getBizDocId()));
        }
        return new ImportBatchView(batch.getId(), batch.getBatchNo(), template.name(), batch.getFileName(),
                batch.getStatus(), batch.getTotalRows(), success, failed, duplicate,
                format(batch.getCreatedAt()), format(batch.getImportedAt()), batch.getCreatedBy(), false, rows);
    }

    /* ------------------------------ 批次查询 ------------------------------ */

    public List<ImportBatchView> listBatches(int limit) {
        return batchMapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ImportBatch>()
                        .orderByDesc("id")
                        .last("LIMIT " + Math.max(1, Math.min(limit, 100))))
                .stream()
                .map(batch -> toView(batch, false))
                .toList();
    }

    public ImportBatchView getBatch(long id) {
        ImportBatch batch = batchMapper.selectById(id);
        if (batch == null) {
            throw BusinessException.notFound("导入批次");
        }
        return toView(batch, false);
    }

    /* ------------------------------ 行准备 ------------------------------ */

    /** 行准备工作：校验 + 解析引用 + 构造写命令（不写入任何数据） */
    private record PreparedRow(int rowNo, Map<String, String> values, List<String> messages,
                               boolean duplicate, String docType, String operation, String idempotencyKey,
                               Supplier<Long> executor) {

        ImportRowView toView() {
            String status = messages.isEmpty() ? (duplicate ? "DUPLICATE" : "VALID") : "INVALID";
            return new ImportRowView(rowNo, values, status, List.copyOf(messages), null, null);
        }

        PreparedRow asDuplicate() {
            return new PreparedRow(rowNo, values, messages, true, docType, operation, idempotencyKey, executor);
        }
    }

    private List<PreparedRow> prepareRows(ImportTemplate template, List<ExcelSheetParser.ParsedRow> rows,
                                          String fileSha) {
        List<PreparedRow> prepared = new ArrayList<>();
        Set<String> seenKeys = new LinkedHashSet<>();
        for (ExcelSheetParser.ParsedRow row : rows) {
            PreparedRow preparedRow = prepareRow(template, row, fileSha);
            // 文件内重复行：按「模板 + 行内容」判定（主数据模板无幂等键，同样适用）
            if (!seenKeys.add(contentKey(template, row.values()))) {
                preparedRow = preparedRow.asDuplicate();
            }
            prepared.add(preparedRow);
        }
        return prepared;
    }

    private PreparedRow prepareRow(ImportTemplate template, ExcelSheetParser.ParsedRow row, String fileSha) {
        Map<String, String> values = row.values();
        List<String> messages = new ArrayList<>();
        for (ImportTemplate.Column column : template.columns()) {
            String value = values.getOrDefault(column.header(), "");
            if (column.required() && value.isEmpty()) {
                messages.add("「" + column.header() + "」必填");
            }
        }
        String key = "imp" + sha256((template.name() + "|" + canonical(template, values)).getBytes(StandardCharsets.UTF_8))
                .substring(0, 40);
        try {
            return switch (template) {
                case CUSTOMER -> prepareCustomer(row, values, messages);
                case SUPPLIER -> prepareSupplier(row, values, messages);
                case SHAREHOLDER -> prepareShareholder(row, values, messages);
                case FUND_ACCOUNT -> prepareAccount(row, values, messages);
                case CONTRIBUTION -> prepareContribution(row, values, messages, key);
                case EXPENSE -> prepareExpense(row, values, messages, key);
                case RECEIVABLE -> prepareReceivable(row, values, messages, key);
                case RECEIPT -> prepareReceipt(row, values, messages, key);
            };
        } catch (BusinessException ex) {
            messages.add(ex.getMessage());
            return new PreparedRow(row.rowNo(), values, messages, false, docTypeOf(template),
                    operationOf(template), key, () -> 0L);
        }
    }

    private PreparedRow prepareCustomer(ExcelSheetParser.ParsedRow row, Map<String, String> values,
                                        List<String> messages) {
        String name = values.getOrDefault("客户名称", "");
        boolean duplicate = !name.isEmpty() && customerDirectory.findCustomerByName(name).isPresent();
        CustomerCreateRequest request = new CustomerCreateRequest(null, name,
                emptyToNull(values.get("联系人")), emptyToNull(values.get("备注")));
        return new PreparedRow(row.rowNo(), values, messages, duplicate, "CUSTOMER", null, null,
                () -> masterdataWriteApi.createCustomer(request));
    }

    private PreparedRow prepareSupplier(ExcelSheetParser.ParsedRow row, Map<String, String> values,
                                        List<String> messages) {
        String name = values.getOrDefault("供应商名称", "");
        boolean duplicate = !name.isEmpty() && supplierDirectory.findSupplierByName(name).isPresent();
        SupplierCreateRequest request = new SupplierCreateRequest(null, name,
                emptyToNull(values.get("联系人")), emptyToNull(values.get("电话")),
                emptyToNull(values.get("备注")));
        return new PreparedRow(row.rowNo(), values, messages, duplicate, "SUPPLIER", null, null,
                () -> masterdataWriteApi.createSupplier(request));
    }

    private PreparedRow prepareShareholder(ExcelSheetParser.ParsedRow row, Map<String, String> values,
                                           List<String> messages) {
        String name = values.getOrDefault("股东名称", "");
        boolean duplicate = !name.isEmpty() && masterdataWriteApi.findShareholderIdByName(name).isPresent();
        ShareholderCreateRequest request = new ShareholderCreateRequest(null, name,
                emptyToNull(values.get("联系方式")), emptyToNull(values.get("备注")));
        return new PreparedRow(row.rowNo(), values, messages, duplicate, "SHAREHOLDER", null, null,
                () -> masterdataWriteApi.createShareholder(request));
    }

    private PreparedRow prepareAccount(ExcelSheetParser.ParsedRow row, Map<String, String> values,
                                       List<String> messages) {
        String name = values.getOrDefault("账户名称", "");
        String type = accountType(values.getOrDefault("账户类型", ""), messages);
        BigDecimal opening = amount(values, "期初余额", "期初余额", true, messages);
        LocalDate openingDate = date(values, "期初日期", messages);
        boolean duplicate = !name.isEmpty() && treasuryWriteApi.findAccountByName(name).isPresent();
        if (!messages.isEmpty()) {
            return new PreparedRow(row.rowNo(), values, messages, duplicate, "FUND_ACCOUNT", null, null,
                    () -> 0L);
        }
        CreateAccountRequest request = new CreateAccountRequest(null, name, type,
                Money.str(opening), openingDate.toString(), null, emptyToNull(values.get("备注")));
        return new PreparedRow(row.rowNo(), values, messages, duplicate, "FUND_ACCOUNT", null, null,
                () -> treasuryWriteApi.createAccount(request));
    }

    private PreparedRow prepareContribution(ExcelSheetParser.ParsedRow row, Map<String, String> values,
                                            List<String> messages, String key) {
        String shareholderName = values.getOrDefault("股东名称", "");
        Long shareholderId = masterdataWriteApi.findShareholderIdByName(shareholderName).orElse(null);
        if (shareholderId == null) {
            messages.add("股东「" + shareholderName + "」不存在或同名多条，请先导入/确认股东主数据");
        }
        Long accountId = accountId(values.getOrDefault("资金账户", ""), messages);
        LocalDate date = date(values, "出资日期", messages);
        BigDecimal amount = amount(values, "金额", "金额", false, messages);
        String operation = "CONTRIBUTION_CREATE";
        if (!messages.isEmpty()) {
            return new PreparedRow(row.rowNo(), values, messages, false, "CONTRIBUTION", operation, key, () -> 0L);
        }
        CreateContributionRequest request = new CreateContributionRequest(shareholderId, date.toString(),
                accountId, Money.str(amount), emptyToNull(values.get("备注")), null, key);
        return new PreparedRow(row.rowNo(), values, messages, false, "CONTRIBUTION", operation, key,
                () -> treasuryWriteApi.createContribution(request));
    }

    private PreparedRow prepareExpense(ExcelSheetParser.ParsedRow row, Map<String, String> values,
                                       List<String> messages, String key) {
        String category = expenseCategory(values.getOrDefault("支出分类", ""), messages);
        String content = values.getOrDefault("支出内容", "");
        LocalDate payDate = date(values, "业务日期", messages);
        Long accountId = accountId(values.getOrDefault("付款账户", ""), messages);
        BigDecimal amount = amount(values, "金额", "金额", false, messages);
        String employeeName = emptyToNull(values.get("员工名称"));
        String salaryMonth = values.getOrDefault("工资月份", "");
        if ("SALARY".equals(category)) {
            if (employeeName == null) {
                messages.add("工资支出必须填写「员工名称」");
            }
            if (salaryMonth.isEmpty()) {
                messages.add("工资支出必须填写「工资月份」（YYYY-MM）");
            }
        }
        if (!salaryMonth.isEmpty()) {
            month(values, "工资月份", messages);
        }
        String operation = "EXPENSE_CREATE";
        if (!messages.isEmpty()) {
            return new PreparedRow(row.rowNo(), values, messages, false, "EXPENSE", operation, key, () -> 0L);
        }
        CreateExpenseRequest request = new CreateExpenseRequest(category, content, null, payDate.toString(),
                accountId, Money.str(amount), emptyToNull(values.get("交易对手")), employeeName,
                emptyToNull(salaryMonth), null, emptyToNull(values.get("备注")), null, key);
        return new PreparedRow(row.rowNo(), values, messages, false, "EXPENSE", operation, key,
                () -> treasuryWriteApi.createExpense(request));
    }

    private PreparedRow prepareReceivable(ExcelSheetParser.ParsedRow row, Map<String, String> values,
                                          List<String> messages, String key) {
        String customerName = values.getOrDefault("客户名称", "");
        CustomerDirectoryApi.CustomerInfo customer = customerDirectory.findCustomerByName(customerName)
                .orElse(null);
        if (customer == null) {
            messages.add("客户「" + customerName + "」不存在或同名多条，请先导入/确认客户主数据");
        } else if (!customer.enabled()) {
            messages.add("客户「" + customerName + "」已停用，禁止新建应收单");
        }
        String accountingMonth = month(values, "所属月份", messages);
        LocalDate statementDate = date(values, "对账日期", messages);
        LocalDate dueDate = date(values, "到期日期", messages, true);
        BigDecimal amount = amount(values, "应收金额", "应收金额", false, messages);
        String operation = "RECEIVABLE_CREATE";
        if (!messages.isEmpty()) {
            return new PreparedRow(row.rowNo(), values, messages, false, "RECEIVABLE", operation, key, () -> 0L);
        }
        CreateReceivableRequest request = new CreateReceivableRequest(customer.id(), accountingMonth,
                statementDate.toString(), dueDate == null ? null : dueDate.toString(), Money.str(amount),
                emptyToNull(values.get("备注")), key);
        return new PreparedRow(row.rowNo(), values, messages, false, "RECEIVABLE", operation, key,
                () -> receivableWriteApi.createReceivable(request));
    }

    private PreparedRow prepareReceipt(ExcelSheetParser.ParsedRow row, Map<String, String> values,
                                       List<String> messages, String key) {
        String customerName = values.getOrDefault("客户名称", "");
        CustomerDirectoryApi.CustomerInfo customer = customerDirectory.findCustomerByName(customerName)
                .orElse(null);
        if (customer == null) {
            messages.add("客户「" + customerName + "」不存在或同名多条，请先导入/确认客户主数据");
        } else if (!customer.enabled()) {
            messages.add("客户「" + customerName + "」已停用，禁止登记回款");
        }
        LocalDate receiptDate = date(values, "实际到账日期", messages);
        Long accountId = accountId(values.getOrDefault("收款账户", ""), messages);
        BigDecimal actual = amount(values, "实际收款金额", "实际收款金额", false, messages);

        String[] statementNos = split(values.getOrDefault("核销对账单编号", ""));
        String[] allocationAmounts = split(values.getOrDefault("核销金额", ""));
        List<ReceiptAllocationRequest> allocations = new ArrayList<>();
        if (statementNos.length != allocationAmounts.length) {
            messages.add("「核销对账单编号」与「核销金额」数量必须一致（英文逗号分隔）");
        } else {
            for (int i = 0; i < statementNos.length; i++) {
                ReceivableWriteApi.ReceivableRef ref = receivableWriteApi
                        .findReceivableByStatementNo(statementNos[i]).orElse(null);
                if (ref == null) {
                    messages.add("对账单编号「" + statementNos[i] + "」不存在");
                    continue;
                }
                if (customer != null && ref.customerId() != customer.id()) {
                    messages.add("对账单「" + statementNos[i] + "」不属于客户「" + customerName + "」（禁止跨客户核销）");
                    continue;
                }
                BigDecimal allocation = ValidationRules.parseAmount(allocationAmounts[i],
                        "核销金额「" + statementNos[i] + "」");
                allocations.add(new ReceiptAllocationRequest(ref.id(), Money.str(allocation)));
            }
        }
        String operation = "RECEIPT_CREATE";
        if (!messages.isEmpty()) {
            return new PreparedRow(row.rowNo(), values, messages, false, "RECEIPT", operation, key, () -> 0L);
        }
        CreateReceiptRequest request = new CreateReceiptRequest(customer.id(), receiptDate.toString(),
                accountId, Money.str(actual), emptyToNull(values.get("银行流水参考号")),
                emptyToNull(values.get("备注")), allocations, key);
        return new PreparedRow(row.rowNo(), values, messages, false, "RECEIPT", operation, key,
                () -> receivableWriteApi.createReceipt(request));
    }

    /* ------------------------------ 内部辅助 ------------------------------ */

    private boolean isDuplicate(PreparedRow row) {
        return row.operation() != null && row.idempotencyKey() != null
                && idempotency.find(row.operation(), row.idempotencyKey()).isPresent();
    }

    private static String docTypeOf(ImportTemplate template) {
        return template.name();
    }

    private static String operationOf(ImportTemplate template) {
        return switch (template) {
            case CONTRIBUTION -> "CONTRIBUTION_CREATE";
            case EXPENSE -> "EXPENSE_CREATE";
            case RECEIVABLE -> "RECEIVABLE_CREATE";
            case RECEIPT -> "RECEIPT_CREATE";
            default -> null;
        };
    }

    private ImportBatch createBatch(ImportTemplate template, String fileName, String sha, int totalRows) {
        String prefix = "IMP-" + BATCH_DATE.format(businessTime.today()) + "-";
        Long max = batchMapper.selectMaxSeq(prefix);
        String batchNo = prefix + String.format("%04d", (max == null ? 0L : max) + 1);
        ImportBatch batch = new ImportBatch();
        batch.setBatchNo(batchNo);
        batch.setTemplateCode(template.name());
        batch.setFileName(fileName);
        batch.setFileSha256(sha);
        batch.setStatus("PARSED");
        batch.setTotalRows(totalRows);
        batch.setSuccessRows(0);
        batch.setFailedRows(0);
        batch.setDuplicateRows(0);
        try {
            batchMapper.insert(batch);
        } catch (DuplicateKeyException duplicate) {
            ImportBatch existing = batchMapper.selectByFile(template.name(), sha);
            if (existing == null) {
                throw BusinessException.conflict("导入批次创建冲突，请重试");
            }
            return existing;
        }
        return batch;
    }

    private ImportBatchView toView(ImportBatch batch, boolean reused) {
        List<ImportRowView> rows = batchRowMapper.selectByBatch(batch.getId()).stream()
                .map(record -> new ImportRowView(record.getRowNo(), Map.of(), record.getStatus(),
                        record.getMessage() == null ? List.of() : List.of(record.getMessage()),
                        record.getBizDocType(), record.getBizDocId()))
                .toList();
        return new ImportBatchView(batch.getId(), batch.getBatchNo(), batch.getTemplateCode(),
                batch.getFileName(), batch.getStatus(), batch.getTotalRows(), batch.getSuccessRows(),
                batch.getFailedRows(), batch.getDuplicateRows(), format(batch.getCreatedAt()),
                format(batch.getImportedAt()), batch.getCreatedBy(), reused, rows);
    }

    private Long accountId(String accountName, List<String> messages) {
        if (accountName.isBlank()) {
            return null;
        }
        Optional<TreasuryWriteApi.AccountSummary> account = treasuryWriteApi.findAccountByName(accountName);
        if (account.isEmpty()) {
            messages.add("资金账户「" + accountName + "」不存在或同名多条，请先导入资金账户");
            return null;
        }
        if (!"ENABLED".equals(account.get().status())) {
            messages.add("资金账户「" + accountName + "」已停用，禁止收付");
            return null;
        }
        return account.get().id();
    }

    private LocalDate date(Map<String, String> values, String header, List<String> messages) {
        return date(values, header, messages, false);
    }

    private LocalDate date(Map<String, String> values, String header, List<String> messages, boolean optional) {
        String raw = values.getOrDefault(header, "");
        if (raw.isEmpty()) {
            if (optional) {
                return null;
            }
            messages.add("「" + header + "」必填");
            return null;
        }
        try {
            LocalDate date = ValidationRules.parseDate(raw, header);
            if (date.isAfter(businessTime.today())) {
                messages.add("「" + header + "」不能晚于当前业务日期");
                return null;
            }
            return date;
        } catch (BusinessException ex) {
            messages.add("「" + header + "」格式不合法（应为 YYYY-MM-DD）");
            return null;
        }
    }

    private String month(Map<String, String> values, String header, List<String> messages) {
        String raw = values.getOrDefault(header, "");
        if (raw.isEmpty()) {
            return null;
        }
        try {
            String month = ValidationRules.parseMonth(raw, header);
            if (month != null && month.compareTo(YearMonth.from(businessTime.today()).toString()) > 0) {
                messages.add("「" + header + "」不能晚于当前月份");
                return null;
            }
            return month;
        } catch (BusinessException ex) {
            messages.add("「" + header + "」格式不合法（应为 YYYY-MM）");
            return null;
        }
    }

    private BigDecimal amount(Map<String, String> values, String header, String label, boolean allowZero,
                              List<String> messages) {
        String raw = values.getOrDefault(header, "");
        if (raw.isEmpty()) {
            return null;
        }
        String normalized = raw.replace(",", "").replace("，", "").trim();
        try {
            return allowZero ? ValidationRules.parseOpeningAmount(normalized, header)
                    : ValidationRules.parseAmount(normalized, header);
        } catch (BusinessException ex) {
            messages.add("「" + label + "」" + ex.getMessage());
            return null;
        }
    }

    private String accountType(String raw, List<String> messages) {
        if (raw.isEmpty()) {
            return null;
        }
        String code = switch (raw.trim()) {
            case "银行", "银行卡" -> "BANK";
            case "现金" -> "CASH";
            case "微信" -> "WECHAT";
            case "支付宝" -> "ALIPAY";
            case "其他" -> "OTHER";
            default -> raw.trim().toUpperCase();
        };
        if (!List.of("BANK", "CASH", "WECHAT", "ALIPAY", "OTHER").contains(code)) {
            messages.add("「账户类型」不合法：应为 BANK/CASH/WECHAT/ALIPAY/OTHER 或对应中文");
            return null;
        }
        return code;
    }

    private String expenseCategory(String raw, List<String> messages) {
        if (raw.isEmpty()) {
            return null;
        }
        String code = switch (raw.trim()) {
            case "采购", "采购支出" -> "PURCHASE";
            case "工资", "工资支出" -> "SALARY";
            case "电费" -> "ELECTRICITY";
            case "水费" -> "WATER";
            case "网络", "网络通讯费" -> "INTERNET";
            case "房租" -> "RENT";
            case "辅料", "辅料耗材" -> "SUPPLIES";
            case "维修", "维修费" -> "REPAIR";
            case "运输", "运输费" -> "TRANSPORT";
            case "其他" -> "OTHER";
            default -> raw.trim().toUpperCase();
        };
        if (!List.of("PURCHASE", "SALARY", "ELECTRICITY", "WATER", "INTERNET", "RENT",
                "SUPPLIES", "REPAIR", "TRANSPORT", "OTHER").contains(code)) {
            messages.add("「支出分类」不合法：请填写分类代码或中文名称（见填写说明）");
            return null;
        }
        return code;
    }

    private static String[] split(String raw) {
        if (raw == null || raw.isBlank()) {
            return new String[0];
        }
        return java.util.Arrays.stream(raw.split("[,，、]"))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .toArray(String[]::new);
    }

    private static String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** 行内容规范化（幂等键与重复判断口径：金额按两位小数、其它去空白） */
    private static String canonical(ImportTemplate template, Map<String, String> values) {
        StringBuilder builder = new StringBuilder();
        for (ImportTemplate.Column column : template.columns()) {
            String raw = values.getOrDefault(column.header(), "").trim();
            if (column.type() == ImportTemplate.ColumnType.MONEY
                    || column.type() == ImportTemplate.ColumnType.OPENING_AMOUNT) {
                String normalized = raw.replace(",", "").replace("，", "");
                if (!normalized.isEmpty()) {
                    try {
                        raw = new BigDecimal(normalized).setScale(2).toPlainString();
                    } catch (NumberFormatException ignored) {
                        // 保留原始文本，由行校验给出明确错误
                    }
                }
            }
            builder.append(column.header()).append('=').append(raw).append('|');
        }
        return builder.toString();
    }

    /** 文件内重复判定键（模板 + 规范化行内容） */
    private static String contentKey(ImportTemplate template, Map<String, String> values) {
        return template.name() + "|" + canonical(template, values);
    }

    private static String toRowData(Map<String, String> values) {
        StringBuilder builder = new StringBuilder();
        values.forEach((header, value) -> {
            if (!value.isEmpty()) {
                if (builder.length() > 0) {
                    builder.append("; ");
                }
                builder.append(header).append(':').append(value);
            }
        });
        String text = builder.toString();
        return text.length() <= 2000 ? text : text.substring(0, 2000);
    }

    private static String truncate(String message) {
        if (message == null) {
            return null;
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }

    private static String format(java.time.LocalDateTime time) {
        return time == null ? null : ISO_DATETIME.format(time);
    }

    private static String fileName(MultipartFile file) {
        String name = file.getOriginalFilename();
        return name == null || name.isBlank() ? "未命名.xlsx" : name;
    }

    private static byte[] readBytes(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw BusinessException.conflict("请选择要导入的 Excel 文件（.xlsx）");
        }
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw BusinessException.conflict("文件读取失败：" + ex.getMessage());
        }
    }

    private static String sha256(byte[] content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(content);
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 不可用", ex);
        }
    }

    /** 供核对服务复用：模板编码 → 展示名 */
    public String displayName(String templateCode) {
        return ImportTemplate.of(templateCode).map(ImportTemplate::displayName).orElse(templateCode);
    }

    /** 空值行数据（测试与展示用） */
    static Map<String, String> emptyValues() {
        return new LinkedHashMap<>();
    }
}
