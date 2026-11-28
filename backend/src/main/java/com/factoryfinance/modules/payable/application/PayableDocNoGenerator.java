package com.factoryfinance.modules.payable.application;

import com.factoryfinance.modules.payable.domain.PayableDocSeries;
import com.factoryfinance.modules.payable.infrastructure.mapper.PayableMapper;
import com.factoryfinance.modules.payable.infrastructure.mapper.PaymentMapper;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * 应付单据编号确定性序列：前缀 + YYYYMM + 4 位序号（YF 应付单 / FK 付款单）。
 */
@Component
public class PayableDocNoGenerator {

    private final PayableMapper payableMapper;
    private final PaymentMapper paymentMapper;

    public PayableDocNoGenerator(PayableMapper payableMapper, PaymentMapper paymentMapper) {
        this.payableMapper = payableMapper;
        this.paymentMapper = paymentMapper;
    }

    public String nextPayableNo(LocalDate bizDate) {
        return nextPayable(PayableDocSeries.PAYABLE, bizDate, false);
    }

    public String nextPayableNoForUpdate(LocalDate bizDate) {
        return nextPayable(PayableDocSeries.PAYABLE, bizDate, true);
    }

    public String nextPaymentNo(LocalDate bizDate) {
        return nextPayment(PayableDocSeries.PAYMENT, bizDate, false);
    }

    public String nextPaymentNoForUpdate(LocalDate bizDate) {
        return nextPayment(PayableDocSeries.PAYMENT, bizDate, true);
    }

    /** 资金流水编号：单据号 + 序位（如 FK-202611-0001-1） */
    public String transactionNo(String docNo, int index) {
        return docNo + "-" + index;
    }

    private String nextPayable(PayableDocSeries series, LocalDate bizDate, boolean locking) {
        String prefix = prefixOf(series.prefix(), bizDate);
        Long max = locking ? payableMapper.selectMaxSeqForUpdate(prefix) : payableMapper.selectMaxSeq(prefix);
        return prefix + String.format("%04d", (max == null ? 0L : max) + 1);
    }

    private String nextPayment(PayableDocSeries series, LocalDate bizDate, boolean locking) {
        String prefix = prefixOf(series.prefix(), bizDate);
        Long max = locking ? paymentMapper.selectMaxSeqForUpdate(prefix) : paymentMapper.selectMaxSeq(prefix);
        return prefix + String.format("%04d", (max == null ? 0L : max) + 1);
    }

    private static String prefixOf(String seriesPrefix, LocalDate bizDate) {
        return seriesPrefix + "-" + String.format("%04d%02d-", bizDate.getYear(), bizDate.getMonthValue());
    }
}
