package com.factoryfinance.modules.importer.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.importer.api.dto.ReconciliationView;
import com.factoryfinance.modules.importer.domain.ImportBatch;
import com.factoryfinance.modules.importer.domain.ImportBatchRow;
import com.factoryfinance.modules.importer.infrastructure.mapper.ImportBatchMapper;
import com.factoryfinance.modules.importer.infrastructure.mapper.ImportBatchRowMapper;
import com.factoryfinance.modules.payable.api.PayableReportingApi;
import com.factoryfinance.modules.receivable.api.ReceivableReportingApi;
import com.factoryfinance.modules.treasury.api.TreasuryWriteApi;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 导入核对（最小可用）：账户余额、总资金、客户应收、供应商应付、导入统计与差异提示。
 *
 * <p>红线：</p>
 * <ul>
 *   <li>余额一律由真实数据重算（账户期初 + 有效流水 / 应收应付原始金额 − 有效核销），
 *       不读取导入批次里的金额，避免「期初 + 历史流水」重复计算；</li>
 *   <li>发现差异只提示，不自动清零、不修改原始金额；</li>
 *   <li>导入失败行不产生业务单据（失败行零残留），成功行可回溯到业务单据主键。</li>
 * </ul>
 */
@Service
public class ReconciliationService {

    private final TreasuryWriteApi treasuryWriteApi;
    private final ReceivableReportingApi receivableReportingApi;
    private final PayableReportingApi payableReportingApi;
    private final ImportBatchMapper batchMapper;
    private final ImportBatchRowMapper batchRowMapper;
    private final BusinessTime businessTime;

    public ReconciliationService(TreasuryWriteApi treasuryWriteApi,
                                 ReceivableReportingApi receivableReportingApi,
                                 PayableReportingApi payableReportingApi,
                                 ImportBatchMapper batchMapper,
                                 ImportBatchRowMapper batchRowMapper,
                                 BusinessTime businessTime) {
        this.treasuryWriteApi = treasuryWriteApi;
        this.receivableReportingApi = receivableReportingApi;
        this.payableReportingApi = payableReportingApi;
        this.batchMapper = batchMapper;
        this.batchRowMapper = batchRowMapper;
        this.businessTime = businessTime;
    }

    public ReconciliationView reconcile() {
        List<ReconciliationView.AccountReconciliation> accounts = treasuryWriteApi.listAccountBalances()
                .stream()
                .map(item -> new ReconciliationView.AccountReconciliation(item.accountNo(), item.name(),
                        item.openingBalance(), item.balance()))
                .toList();
        BigDecimal totalFund = accounts.stream()
                .map(item -> new BigDecimal(item.balance()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<ReconciliationView.ReceivableReconciliation> receivables = receivableReportingApi
                .outstandingByCustomer().stream()
                .map(item -> new ReconciliationView.ReceivableReconciliation(item.customerId(),
                        item.customerName(), com.factoryfinance.common.money.Money.str(item.outstanding()),
                        com.factoryfinance.common.money.Money.str(item.originalTotal())))
                .toList();
        BigDecimal totalReceivable = receivables.stream()
                .map(item -> new BigDecimal(item.outstanding()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<ReconciliationView.PayableReconciliation> payables = payableReportingApi
                .outstandingBySupplier().stream()
                .map(item -> new ReconciliationView.PayableReconciliation(item.supplierId(),
                        item.supplierName(),
                        com.factoryfinance.common.money.Money.str(item.outstanding())))
                .toList();
        BigDecimal totalPayable = payables.stream()
                .map(item -> new BigDecimal(item.outstanding()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<ImportBatch> batches = batchMapper.selectList(new QueryWrapper<ImportBatch>().orderByDesc("id"));
        int success = batches.stream().mapToInt(batch -> value(batch.getSuccessRows())).sum();
        int failed = batches.stream().mapToInt(batch -> value(batch.getFailedRows())).sum();
        int duplicate = batches.stream().mapToInt(batch -> value(batch.getDuplicateRows())).sum();
        ImportBatch latest = batches.isEmpty() ? null : batches.get(0);
        ReconciliationView.ImportStats stats = new ReconciliationView.ImportStats(
                (int) batches.stream().filter(batch -> "IMPORTED".equals(batch.getStatus())).count(),
                success, failed, duplicate,
                latest == null ? null : latest.getBatchNo(),
                latest == null ? null : latest.getStatus());

        return new ReconciliationView(
                businessTime.today().toString(),
                accounts,
                com.factoryfinance.common.money.Money.str(totalFund),
                receivables,
                com.factoryfinance.common.money.Money.str(totalReceivable),
                payables,
                com.factoryfinance.common.money.Money.str(totalPayable),
                stats,
                warnings(accounts, batches));
    }

    /** 差异提示（只提示，不自动处理） */
    private List<String> warnings(List<ReconciliationView.AccountReconciliation> accounts,
                                  List<ImportBatch> batches) {
        List<String> warnings = new ArrayList<>();
        accounts.stream()
                .filter(account -> new BigDecimal(account.balance()).signum() < 0)
                .forEach(account -> warnings.add("资金账户「" + account.name() + "」余额为负（"
                        + account.balance() + "），请核对期初与历史流水"));

        int failedRows = batches.stream().mapToInt(batch -> value(batch.getFailedRows())).sum();
        if (failedRows > 0) {
            warnings.add("历史导入存在 " + failedRows + " 行失败记录，请按批次明细逐行修正后重新导入（失败行未产生任何业务数据）");
        }

        int missingDocs = batchRowMapper.selectCount(new QueryWrapper<ImportBatchRow>()
                .eq("status", "SUCCESS")
                .isNull("biz_doc_id")).intValue();
        if (missingDocs > 0) {
            warnings.add("存在 " + missingDocs + " 条成功行未记录业务单据主键，请联系维护人员核查");
        }

        long batchesWithFailure = batches.stream()
                .filter(batch -> value(batch.getFailedRows()) > 0)
                .count();
        if (batchesWithFailure > 0) {
            warnings.add("有 " + batchesWithFailure + " 个导入批次存在失败行，导入核对口径以业务表为准（不自动清零）");
        }
        return warnings;
    }

    private static int value(Integer value) {
        return value == null ? 0 : value;
    }
}
