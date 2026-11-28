package com.factoryfinance.payable;

import com.factoryfinance.receivable.Phase2TestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 正式应付账款与付款核销集成测试（真实 MySQL）：
 * <ol>
 *   <li>确认应付单不立即扣减资金；确认付款才产生资金流出并减少应付余额；</li>
 *   <li>部分付款 + 多单核销；未分配付款/预付款拒绝；</li>
 *   <li>跨供应商核销、超额付款拒绝；</li>
 *   <li>已由 Phase 1 采购支出直接支付的应付单禁止再次付款（不重复扣减资金）；</li>
 *   <li>撤销付款恢复双方余额；有核销的应付单禁止直接撤销；</li>
 *   <li>付款请求幂等（同键同参不重复记账）。</li>
 * </ol>
 */
class PayableAndPaymentIT extends Phase2TestSupport {

    @Test
    void confirmingPayableDoesNotTouchFunds() throws Exception {
        long supplierId = seedSupplier("应付供应商");
        long accountId = seedAccount("应付账户", "BANK", "10000.00", today());
        BigDecimal balanceBefore = rawBalance(accountId);

        JsonNode payable = createPayable(supplierId, "10000.00", "采购原料");

        assertThat(rawBalance(accountId)).as("确认应付不立即扣减资金").isEqualByComparingTo(balanceBefore);
        assertThat(rawPayableOutstanding(payable.path("id").asLong())).isEqualByComparingTo("10000");
        assertThat(payable.path("paymentStatus").asText()).isEqualTo("UNPAID");
    }

    @Test
    void partialPaymentReducesFundsAndPayable() throws Exception {
        long supplierId = seedSupplier("付款供应商");
        long accountId = seedAccount("付款账户", "BANK", "10000.00", today());
        long payableId = createPayable(supplierId, "10000.00", "采购原料").path("id").asLong();

        HttpResult payment = createPayment(supplierId, accountId, "4000.00",
                Map.of(payableId, "4000.00"));
        assertThat(payment.status()).as("确认付款应成功：%s", payment.body()).isEqualTo(200);
        long paymentId = payment.data().path("id").asLong();

        assertThat(rawBalance(accountId)).as("资金余额减少 4,000").isEqualByComparingTo("6000");
        assertThat(flowCount("PAYMENT", paymentId)).as("一笔付款只一条资金流出").isEqualTo(1);
        assertThat(rawPayableOutstanding(payableId)).isEqualByComparingTo("6000");

        JsonNode detail = get("/api/v1/payable/payables/" + payableId).data();
        assertThat(detail.path("paymentStatus").asText()).isEqualTo("PARTIALLY_PAID");
        assertThat(detail.path("paidAmount").asText()).isEqualTo("4000.00");
        assertThat(detail.path("outstandingAmount").asText()).isEqualTo("6000.00");
    }

    @Test
    void paymentAllocatesAcrossTwoPayables() throws Exception {
        long supplierId = seedSupplier("多单供应商");
        long accountId = seedAccount("多单账户", "BANK", "20000.00", today());
        long first = createPayable(supplierId, "6000.00", "原料A").path("id").asLong();
        long second = createPayable(supplierId, "4000.00", "原料B").path("id").asLong();

        HttpResult payment = createPayment(supplierId, accountId, "10000.00", Map.of(first, "6000.00", second, "4000.00"));
        assertThat(payment.status()).isEqualTo(200);
        assertThat(payment.data().path("allocations").size()).isEqualTo(2);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("10000");
        assertThat(rawPayableOutstanding(first)).isEqualByComparingTo("0");
        assertThat(rawPayableOutstanding(second)).isEqualByComparingTo("0");
    }

    @Test
    void overPaymentCrossSupplierAndPartialPaymentRejected() throws Exception {
        long supplierId = seedSupplier("校验供应商");
        long otherSupplierId = seedSupplier("他供应商");
        long accountId = seedAccount("校验付款账户", "BANK", "50000.00", today());
        long payableId = createPayable(supplierId, "5000.00", "原料X").path("id").asLong();
        long otherPayableId = createPayable(otherSupplierId, "3000.00", "原料Y").path("id").asLong();

        HttpResult over = createPayment(supplierId, accountId, "6000.00", Map.of(payableId, "6000.00"));
        assertThat(over.status()).as("超额付款必须拒绝").isEqualTo(400);

        HttpResult cross = createPayment(supplierId, accountId, "3000.00", Map.of(otherPayableId, "3000.00"));
        assertThat(cross.status()).as("跨供应商核销必须拒绝").isEqualTo(400);

        HttpResult partial = createPayment(supplierId, accountId, "5000.00", Map.of(payableId, "2000.00"));
        assertThat(partial.status()).as("未全额核销必须拒绝").isEqualTo(400);

        assertThat(rawBalance(accountId)).isEqualByComparingTo("50000");
        assertThat(rawPayableOutstanding(payableId)).isEqualByComparingTo("5000");
        assertThat(count("SELECT COUNT(*) FROM pay_payment WHERE supplier_id = ?", supplierId)).isZero();
    }

    @Test
    void payableFundedByPurchaseExpenseCannotBePaidAgain() throws Exception {
        long supplierId = seedSupplier("支出支付供应商");
        long accountId = seedAccount("支出支付账户", "BANK", "10000.00", today());

        // Phase 1 直接登记的采购付款（资金已流出）
        HttpResult expense = post("/api/v1/treasury/expenses", map(
                "category", "PURCHASE",
                "content", "直接采购付款",
                "payDate", today(),
                "accountId", accountId,
                "amount", "3000.00",
                "payee", "直接采购供应商",
                "idempotencyKey", newIdempotencyKey()));
        assertThat(expense.status()).as("直接采购支出应成功：%s", expense.body()).isEqualTo(200);
        long expenseId = expense.data().path("id").asLong();
        assertThat(rawBalance(accountId)).isEqualByComparingTo("7000");

        // 关联该支出单的应付单：视为已支付，禁止再次付款
        HttpResult payable = post("/api/v1/payable/payables", map(
                "supplierId", supplierId,
                "bizDate", today(),
                "accountingMonth", currentMonth(),
                "amount", "3000.00",
                "content", "已由支出单支付",
                "fundedExpenseId", expenseId,
                "idempotencyKey", newIdempotencyKey()));
        assertThat(payable.status()).as("创建关联应付单应成功：%s", payable.body()).isEqualTo(200);
        long payableId = payable.data().path("id").asLong();
        assertThat(payable.data().path("paymentStatus").asText()).isEqualTo("SETTLED");
        assertThat(payable.data().path("outstandingAmount").asText()).isEqualTo("0.00");

        HttpResult payAgain = createPayment(supplierId, accountId, "3000.00", Map.of(payableId, "3000.00"));
        assertThat(payAgain.status()).as("已由支出单直接支付的应付单禁止重复付款（状态冲突 409）").isEqualTo(409);
        assertThat(rawBalance(accountId)).as("不得重复扣减资金").isEqualByComparingTo("7000");
    }

    @Test
    void voidPaymentRestoresBalancesAndKeepsTrace() throws Exception {
        long supplierId = seedSupplier("撤销付款供应商");
        long accountId = seedAccount("撤销付款账户", "BANK", "8000.00", today());
        long payableId = createPayable(supplierId, "3000.00", "原料Z").path("id").asLong();
        HttpResult payment = createPayment(supplierId, accountId, "3000.00", Map.of(payableId, "3000.00"));
        assertThat(payment.status()).isEqualTo(200);
        long paymentId = payment.data().path("id").asLong();
        assertThat(rawBalance(accountId)).isEqualByComparingTo("5000");

        HttpResult voidPayableAttempt = post("/api/v1/payable/payables/" + payableId + "/void",
                map("voidDate", today()));
        assertThat(voidPayableAttempt.status()).as("已有付款核销的应付单禁止直接撤销").isEqualTo(409);

        HttpResult voided = post("/api/v1/payable/payments/" + paymentId + "/void",
                map("voidDate", today(), "reason", "付款退回"));
        assertThat(voided.status()).as("撤销付款应成功：%s", voided.body()).isEqualTo(200);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("8000");
        assertThat(rawPayableOutstanding(payableId)).isEqualByComparingTo("3000");
        assertThat(count("SELECT COUNT(*) FROM pay_payment WHERE id = ? AND status = 'VOIDED'", paymentId))
                .isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM pay_payment_allocation WHERE payment_id = ? AND status = 'REVERSED'",
                paymentId)).isEqualTo(1);
    }

    @Test
    void paymentIdempotencyByRequestKey() throws Exception {
        long supplierId = seedSupplier("幂等付款供应商");
        long accountId = seedAccount("幂等付款账户", "BANK", "5000.00", today());
        long payableId = createPayable(supplierId, "2000.00", "幂等原料").path("id").asLong();

        String key = newIdempotencyKey();
        Map<String, Object> body = map(
                "supplierId", supplierId,
                "paymentDate", today(),
                "accountId", accountId,
                "amount", "2000.00",
                "allocations", List.of(Map.of("payableId", payableId, "amount", "2000.00")),
                "idempotencyKey", key);

        HttpResult first = post("/api/v1/payable/payments", body);
        HttpResult replay = post("/api/v1/payable/payments", body);
        assertThat(first.status()).isEqualTo(200);
        assertThat(replay.status()).as("同键同参重复提交返回原单据").isEqualTo(200);
        assertThat(replay.dataText("paymentNo")).isEqualTo(first.dataText("paymentNo"));
        assertThat(rawBalance(accountId)).isEqualByComparingTo("3000");
        assertThat(count("SELECT COUNT(*) FROM pay_payment WHERE supplier_id = ?", supplierId)).isEqualTo(1);
    }

    /* ------------------------------ 内部辅助 ------------------------------ */

    private JsonNode createPayable(long supplierId, String amount, String content) throws Exception {
        HttpResult result = post("/api/v1/payable/payables", map(
                "supplierId", supplierId,
                "bizDate", today(),
                "accountingMonth", currentMonth(),
                "amount", amount,
                "content", content,
                "idempotencyKey", newIdempotencyKey()));
        assertThat(result.status()).as("创建应付单应成功：%s", result.body()).isEqualTo(200);
        return result.data();
    }

    private HttpResult createPayment(long supplierId, long accountId, String amount,
                                     Map<Long, String> allocations) throws Exception {
        List<Map<String, Object>> lines = allocations.entrySet().stream().map(entry -> {
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("payableId", entry.getKey());
            line.put("amount", entry.getValue());
            return line;
        }).toList();
        return post("/api/v1/payable/payments", map(
                "supplierId", supplierId,
                "paymentDate", today(),
                "accountId", accountId,
                "amount", amount,
                "allocations", lines,
                "idempotencyKey", newIdempotencyKey()));
    }


}
