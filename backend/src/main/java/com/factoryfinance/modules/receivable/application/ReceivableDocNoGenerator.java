package com.factoryfinance.modules.receivable.application;

import com.factoryfinance.modules.receivable.domain.ReceivableDocSeries;
import com.factoryfinance.modules.receivable.infrastructure.mapper.ReceiptMapper;
import com.factoryfinance.modules.receivable.infrastructure.mapper.ReceivableMapper;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * 应收单据编号确定性序列：前缀 + YYYYMM + 4 位序号（YS 应收单 / SK 收款单）。
 * 编号一经生成不可变；数据库唯一键为并发最终防线。
 */
@Component
public class ReceivableDocNoGenerator {

    private final ReceivableMapper receivableMapper;
    private final ReceiptMapper receiptMapper;

    public ReceivableDocNoGenerator(ReceivableMapper receivableMapper, ReceiptMapper receiptMapper) {
        this.receivableMapper = receivableMapper;
        this.receiptMapper = receiptMapper;
    }

    public String nextStatementNo(LocalDate bizDate) {
        return nextReceivable(ReceivableDocSeries.STATEMENT, bizDate, false);
    }

    public String nextStatementNoForUpdate(LocalDate bizDate) {
        return nextReceivable(ReceivableDocSeries.STATEMENT, bizDate, true);
    }

    public String nextReceiptNo(LocalDate bizDate) {
        return nextReceipt(ReceivableDocSeries.RECEIPT, bizDate, false);
    }

    public String nextReceiptNoForUpdate(LocalDate bizDate) {
        return nextReceipt(ReceivableDocSeries.RECEIPT, bizDate, true);
    }

    /** 资金流水编号：单据号 + 序位（如 SK-202611-0001-1），确定性且唯一 */
    public String transactionNo(String docNo, int index) {
        return docNo + "-" + index;
    }

    private String nextReceivable(ReceivableDocSeries series, LocalDate bizDate, boolean locking) {
        String prefix = prefixOf(series.prefix(), bizDate);
        Long max = locking ? receivableMapper.selectMaxSeqForUpdate(prefix) : receivableMapper.selectMaxSeq(prefix);
        return prefix + String.format("%04d", (max == null ? 0L : max) + 1);
    }

    private String nextReceipt(ReceivableDocSeries series, LocalDate bizDate, boolean locking) {
        String prefix = prefixOf(series.prefix(), bizDate);
        Long max = locking ? receiptMapper.selectMaxSeqForUpdate(prefix) : receiptMapper.selectMaxSeq(prefix);
        return prefix + String.format("%04d", (max == null ? 0L : max) + 1);
    }

    private static String prefixOf(String seriesPrefix, LocalDate bizDate) {
        return seriesPrefix + "-" + String.format("%04d%02d-", bizDate.getYear(), bizDate.getMonthValue());
    }
}
