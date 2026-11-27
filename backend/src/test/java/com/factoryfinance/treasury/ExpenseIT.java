package com.factoryfinance.treasury;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 日常支出：OUT 流水、分类枚举、工资必填、非法金额/日期、单据编号幂等。
 * 业务日期取 T-2。
 */
class ExpenseIT extends TreasuryTestSupport {

    @Test
    void expensesCreateOutFlowsWithCategories() throws Exception {
        long accountId = seedAccount("支出测试账户", "BANK", "10000.00", day(2));

        HttpResult e1 = post("/api/v1/treasury/expenses", map(
                "category", "PURCHASE", "content", "采购原料",
                "payDate", day(2), "accountId", accountId, "amount", "1200.00",
                "payee", "供应商甲"));
        HttpResult e2 = post("/api/v1/treasury/expenses", map(
                "category", "SALARY", "content", "11月工资",
                "payDate", day(2), "accountId", accountId, "amount", "3000.00",
                "employeeName", "张三", "salaryMonth", "2026-11"));
        HttpResult e3 = post("/api/v1/treasury/expenses", map(
                "category", "ELECTRICITY", "content", "电费",
                "payDate", day(2), "accountId", accountId, "amount", "800.00",
                "payee", "供电局"));
        assertThat(e1.status()).isEqualTo(200);
        assertThat(e2.status()).isEqualTo(200);
        assertThat(e3.status()).isEqualTo(200);
        assertThat(e2.dataText("employeeName")).isEqualTo("张三");
        assertThat(e2.dataText("salaryMonth")).isEqualTo("2026-11");
        assertThat(e3.dataText("docNo")).startsWith("ZC-");

        // 三条 OUT 流水，余额 = 10000 − 5000 = 5000（独立重算）
        assertThat(rawBalance(accountId)).isEqualByComparingTo("5000");
        Integer outCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM tst_fund_transaction t
                JOIN tst_expense e ON t.source_doc_id = e.id AND t.source_doc_type = 'EXPENSE'
                WHERE e.account_id = ? AND t.direction = 'OUT'
                """, Integer.class, accountId);
        assertThat(outCount).isEqualTo(3);

        // 分类筛选
        HttpResult filtered = get("/api/v1/treasury/expenses", Map.of(
                "category", "SALARY", "dateFrom", day(2), "dateTo", day(2), "size", "50"));
        boolean salaryFound = false;
        for (JsonNode item : filtered.data().path("items")) {
            if (item.path("id").asLong() == e2.data().path("id").asLong()) {
                salaryFound = true;
                assertThat(item.path("category").asText()).isEqualTo("SALARY");
            }
        }
        assertThat(salaryFound).isTrue();

        // 支出分类枚举全集可入账（V2 CHECK 对齐）
        for (String category : new String[]{"WATER", "INTERNET", "RENT", "SUPPLIES", "REPAIR", "TRANSPORT", "OTHER"}) {
            HttpResult ok = post("/api/v1/treasury/expenses", map(
                    "category", category, "content", category + "支出",
                    "payDate", day(2), "accountId", accountId, "amount", "1.00"));
            assertThat(ok.status()).as("category=%s 应可入账", category).isEqualTo(200);
        }
    }

    @Test
    void categoryAndSalaryValidation() throws Exception {
        long accountId = seedAccount("支出校验账户", "CASH", "100.00", day(2));

        // 非法分类
        HttpResult badCategory = post("/api/v1/treasury/expenses", map(
                "category", "FOOD", "content", "吃饭", "payDate", day(2),
                "accountId", accountId, "amount", "10.00"));
        assertThat(badCategory.status()).isEqualTo(400);
        assertThat(badCategory.code()).isEqualTo("VALIDATION_ERROR");

        // 工资必须带 employeeName + salaryMonth
        HttpResult salaryMissing = post("/api/v1/treasury/expenses", map(
                "category", "SALARY", "content", "工资", "payDate", day(2),
                "accountId", accountId, "amount", "10.00"));
        assertThat(salaryMissing.status()).isEqualTo(400);
        assertThat(salaryMissing.code()).isEqualTo("VALIDATION_ERROR");

        HttpResult salaryMonthBad = post("/api/v1/treasury/expenses", map(
                "category", "SALARY", "content", "工资", "payDate", day(2),
                "accountId", accountId, "amount", "10.00",
                "employeeName", "李四", "salaryMonth", "2026-13"));
        assertThat(salaryMonthBad.status()).isEqualTo(400);

        // 非法 bizMonth
        HttpResult bizMonthBad = post("/api/v1/treasury/expenses", map(
                "category", "RENT", "content", "房租", "bizMonth", "20261",
                "payDate", day(2), "accountId", accountId, "amount", "10.00"));
        assertThat(bizMonthBad.status()).isEqualTo(400);

        // 金额 1.234 拒绝 + 未来支付日期拒绝
        HttpResult amountBad = post("/api/v1/treasury/expenses", map(
                "category", "RENT", "content", "房租", "payDate", day(2),
                "accountId", accountId, "amount", "1.234"));
        assertThat(amountBad.status()).isEqualTo(400);
        assertThat(amountBad.code()).isEqualTo("VALIDATION_ERROR");

        HttpResult futurePay = post("/api/v1/treasury/expenses", map(
                "category", "RENT", "content", "房租",
                "payDate", businessTime.today().plusDays(3).toString(),
                "accountId", accountId, "amount", "10.00"));
        assertThat(futurePay.status()).isEqualTo(400);
        assertThat(futurePay.code()).isEqualTo("VALIDATION_ERROR");
    }

    @Test
    void duplicateClientDocNoRejectedWith409() throws Exception {
        long accountId = seedAccount("支出幂等账户", "BANK", "100.00", day(2));
        String docNo = "ZC-" + day(2).replace("-", "").substring(0, 6) + "-9001";

        HttpResult first = post("/api/v1/treasury/expenses", map(
                "category", "OTHER", "content", "重复提交测试", "payDate", day(2),
                "accountId", accountId, "amount", "50.00", "docNo", docNo));
        assertThat(first.status()).isEqualTo(200);

        HttpResult second = post("/api/v1/treasury/expenses", map(
                "category", "OTHER", "content", "重复提交测试", "payDate", day(2),
                "accountId", accountId, "amount", "50.00", "docNo", docNo));
        assertThat(second.status()).isEqualTo(409);
        assertThat(second.code()).isEqualTo("CONFLICT");

        // 仅一条单据 + 一条流水
        Integer docs = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM tst_expense WHERE doc_no = ?", Integer.class, docNo);
        assertThat(docs).isEqualTo(1);
        BigDecimal balance = rawBalance(accountId);
        assertThat(balance).isEqualByComparingTo("50");
    }
}
