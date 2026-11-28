package com.factoryfinance.receivable;

import com.factoryfinance.treasury.TreasuryTestSupport;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 2 应收/应付集成测试基座：真实 HTTP + 真实 MySQL（Testcontainers 或外部实例）。
 *
 * <p>余额与派生值断言一律使用独立 SQL 重算（期初 + 有效流水 / 原始金额 − 有效核销），
 * 不依赖被测代码的查询实现。</p>
 */
public abstract class Phase2TestSupport extends TreasuryTestSupport {

    /** 种子客户（HTTP 创建，编号由后端生成） */
    protected long seedCustomer(String namePrefix) throws Exception {
        HttpResult result = post("/api/v1/masterdata/customers", map("name", uniqueName(namePrefix)));
        assertThat(result.status()).as("创建客户应成功：%s", result.body()).isEqualTo(200);
        return result.data().path("id").asLong();
    }

    /** 种子供应商 */
    protected long seedSupplier(String namePrefix) throws Exception {
        HttpResult result = post("/api/v1/masterdata/suppliers", map("name", uniqueName(namePrefix)));
        assertThat(result.status()).as("创建供应商应成功：%s", result.body()).isEqualTo(200);
        return result.data().path("id").asLong();
    }

    protected static String uniqueName(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    /** 业务日期为今天（账期与逾期判定基准） */
    protected String today() {
        return day(0);
    }

    protected String currentMonth() {
        return today().substring(0, 7);
    }

    /** 新建应收单（今天对账，必填幂等键） */
    protected JsonNode createReceivable(long customerId, String amount) throws Exception {
        HttpResult result = post("/api/v1/receivable/receivables", map(
                "customerId", customerId,
                "accountingMonth", currentMonth(),
                "statementDate", today(),
                "amount", amount,
                "idempotencyKey", newIdempotencyKey()));
        assertThat(result.status()).as("创建应收单应成功：%s", result.body()).isEqualTo(200);
        return result.data();
    }

    /** 确认收款（全额核销：Σ核销 = 实收） */
    protected HttpResult createReceipt(long customerId, long accountId, String actualAmount,
                                       Map<Long, String> allocations) throws Exception {
        List<Map<String, Object>> lines = new ArrayList<>();
        allocations.forEach((receivableId, amount) -> {
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("receivableId", receivableId);
            line.put("amount", amount);
            lines.add(line);
        });
        return post("/api/v1/receivable/receipts", map(
                "customerId", customerId,
                "receiptDate", today(),
                "accountId", accountId,
                "actualAmount", actualAmount,
                "allocations", lines,
                "idempotencyKey", newIdempotencyKey()));
    }

    /** 独立 SQL：应收单有效核销合计 */
    protected BigDecimal rawAllocated(long receivableId) {
        return jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(allocation_amount), 0) FROM rcv_receipt_allocation "
                        + "WHERE receivable_id = ? AND status = 'ACTIVE'",
                BigDecimal.class, receivableId);
    }

    /** 独立 SQL：应收单原始金额 */
    protected BigDecimal rawReceivableAmount(long receivableId) {
        return jdbcTemplate.queryForObject(
                "SELECT original_amount FROM rcv_receivable WHERE id = ?", BigDecimal.class, receivableId);
    }

    /** 独立 SQL：应收单未收余额 = 原始 − 有效核销 */
    protected BigDecimal rawOutstanding(long receivableId) {
        return rawReceivableAmount(receivableId).subtract(rawAllocated(receivableId));
    }

    /** 独立 SQL：应付单未付余额 = 应付金额 − 有效付款核销（含支出单直接支付情形） */
    protected BigDecimal rawPayableOutstanding(long payableId) {
        BigDecimal amount = jdbcTemplate.queryForObject(
                "SELECT amount FROM pay_payable WHERE id = ?", BigDecimal.class, payableId);
        BigDecimal allocated = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(allocation_amount), 0) FROM pay_payment_allocation "
                        + "WHERE payable_id = ? AND status = 'ACTIVE'", BigDecimal.class, payableId);
        Long funded = jdbcTemplate.queryForObject(
                "SELECT funded_expense_id FROM pay_payable WHERE id = ?", Long.class, payableId);
        return funded == null ? amount.subtract(allocated) : BigDecimal.ZERO;
    }

    /** 独立 SQL：表行数 */
    protected int count(String sql, Object... args) {
        Integer value = jdbcTemplate.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }
}
