package com.factoryfinance.treasury;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.Iterator;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 经营概览 + 验收场景快照（业务日期取 T-6，日期窗口互不干扰）：
 * 出资 10,000 → 银行；支出 1,200/3,000/800 → 银行；转账 1,000 银行→备用金；
 * 场景后 银行 4,000 / 备用金 1,000 / 合计 5,000；撤销 1,200 支出后合计 6,200。
 * 口径断言：股东出资不计营业收入；内部转账不计外部支出；资金支出口径独立标注。
 */
class DashboardSummaryIT extends TreasuryTestSupport {

    @Test
    void acceptanceScenarioBalancesAndDashboardCalibers() throws Exception {
        long shareholderId = seedShareholder("概览出资股东", "ENABLED");
        long bank = seedAccount("概览银行账户", "BANK", "0.00", day(6));
        long petty = seedAccount("概览备用金", "CASH", "0.00", day(6));

        // 出资 10,000 → 银行
        assertThat(post("/api/v1/treasury/contributions", map(
                "shareholderId", shareholderId, "contributionDate", day(6),
                "accountId", bank, "amount", "10000.00")).status()).isEqualTo(200);
        // 支出 1,200 / 3,000（工资）/ 800 → 银行
        HttpResult expense1200 = post("/api/v1/treasury/expenses", map(
                "category", "PURCHASE", "content", "原材料采购", "payDate", day(6),
                "accountId", bank, "amount", "1200.00", "payee", "供应商丙"));
        assertThat(expense1200.status()).isEqualTo(200);
        assertThat(post("/api/v1/treasury/expenses", map(
                "category", "SALARY", "content", "11月工资", "payDate", day(6),
                "accountId", bank, "amount", "3000.00",
                "employeeName", "王五", "salaryMonth", "2026-11")).status()).isEqualTo(200);
        assertThat(post("/api/v1/treasury/expenses", map(
                "category", "ELECTRICITY", "content", "电费", "payDate", day(6),
                "accountId", bank, "amount", "800.00", "payee", "供电局")).status()).isEqualTo(200);
        // 转账 1,000 银行 → 备用金
        assertThat(post("/api/v1/treasury/transfers", map(
                "transferDate", day(6), "fromAccountId", bank,
                "toAccountId", petty, "amount", "1000.00")).status()).isEqualTo(200);

        // 场景后：银行 4,000 / 备用金 1,000 / 合计 5,000（API 与独立重算一致）
        assertAccountBalance(bank, "4000");
        assertAccountBalance(petty, "1000");
        assertThat(rawBalance(bank).add(rawBalance(petty))).isEqualByComparingTo("5000");

        // Dashboard 口径
        HttpResult summaryR = get("/api/v1/treasury/dashboard/summary", Map.of(
                "from", day(6), "to", day(6)));
        assertThat(summaryR.status()).isEqualTo(200);
        JsonNode summary = summaryR.data();
        assertThat(dec(summary.path("periodContributionTotal").asText())).isEqualByComparingTo("10000");
        // 资金支出口径：支出单 CONFIRMED 合计 5,000（含 1,200/3,000/800）
        assertThat(dec(summary.path("periodExpenseTotal").asText())).isEqualByComparingTo("5000");
        // 期间资金流入 = 外部 IN（含股东出资）= 10,000
        assertThat(dec(summary.path("periodExternalInflow").asText())).isEqualByComparingTo("10000");
        // 内部转账不计外部支出：外部流出 5,000（而非 6,000）
        assertThat(dec(summary.path("periodExternalOutflow").asText())).isEqualByComparingTo("5000");
        // 当前资金余额 = 全部账户重算合计（与独立 SQL 一致）
        assertThat(dec(summary.path("currentBalance").asText()))
                .isEqualByComparingTo(rawTotalBalance());

        // 趋势：按日外部收付，转账被排除
        JsonNode trend = summary.path("trend");
        assertThat(trend.size()).isEqualTo(1);
        assertThat(dec(trend.get(0).path("inflow").asText())).isEqualByComparingTo("10000");
        assertThat(dec(trend.get(0).path("outflow").asText())).isEqualByComparingTo("5000");
        assertThat(dec(trend.get(0).path("correctionIn").asText())).isEqualByComparingTo("0");
        // 近期流水：结构完整（条数上限 8）
        assertThat(summary.path("recentTransactions").size()).isLessThanOrEqualTo(8);

        // 口径标注："资金支出"、"股东出资 ≠ 营业收入"
        String calibers = summary.path("calibers").toString();
        assertThat(calibers).contains("资金支出");
        assertThat(calibers).contains("不计营业收入");
        // 出资不计收入：概览不存在任何"收入/营业收入/revenue"金额字段
        assertThat(fieldNames(summary)).noneMatch(n -> n.matches("(?i).*(revenue|income).*"));

        // ===== 撤销 1,200 支出 → 总资金 6,200 =====
        long expenseId = expense1200.data().path("id").asLong();
        HttpResult voided = post("/api/v1/treasury/expenses/" + expenseId + "/void",
                map("voidDate", day(6), "reason", "采购作废"));
        assertThat(voided.status()).isEqualTo(200);

        assertAccountBalance(bank, "5200");
        assertAccountBalance(petty, "1000");
        assertThat(rawBalance(bank).add(rawBalance(petty))).isEqualByComparingTo("6200");

        // 撤销后：余额与"期初 + 全部流水重算"一致；趋势按撤销日展示为更正
        HttpResult summaryAfterR = get("/api/v1/treasury/dashboard/summary", Map.of(
                "from", day(6), "to", day(6)));
        JsonNode summaryAfter = summaryAfterR.data();
        assertThat(dec(summaryAfter.path("currentBalance").asText()))
                .isEqualByComparingTo(rawTotalBalance());
        // 支出单 CONFIRMED 合计剔除已撤销 1,200 → 3,800
        assertThat(dec(summaryAfter.path("periodExpenseTotal").asText())).isEqualByComparingTo("3800");
        JsonNode trendAfter = summaryAfter.path("trend");
        assertThat(dec(trendAfter.get(0).path("correctionIn").asText())).isEqualByComparingTo("1200");
        assertThat(dec(trendAfter.get(0).path("correctionOut").asText())).isEqualByComparingTo("0");
        // 外部收付口径剔除 VOID 反向：流入仍 10,000、流出仍 5,000
        assertThat(dec(summaryAfter.path("periodExternalInflow").asText())).isEqualByComparingTo("10000");
        assertThat(dec(summaryAfter.path("periodExternalOutflow").asText())).isEqualByComparingTo("5000");

        // 重复撤销 409
        HttpResult again = post("/api/v1/treasury/expenses/" + expenseId + "/void",
                map("voidDate", day(6)));
        assertThat(again.status()).isEqualTo(409);
        assertThat(again.code()).isEqualTo("CONFLICT");
    }

    private void assertAccountBalance(long accountId, String expected) throws Exception {
        HttpResult accounts = get("/api/v1/treasury/accounts", Map.of("size", "200"));
        for (JsonNode item : accounts.data().path("items")) {
            if (item.path("id").asLong() == accountId) {
                assertThat(dec(item.path("currentBalance").asText()))
                        .as("账户 %d 余额", accountId)
                        .isEqualByComparingTo(expected);
                assertThat(dec(item.path("currentBalance").asText()))
                        .isEqualByComparingTo(rawBalance(accountId));
                return;
            }
        }
        throw new AssertionError("账户未找到: " + accountId);
    }

    private static java.util.List<String> fieldNames(JsonNode node) {
        java.util.List<String> names = new java.util.ArrayList<>();
        Iterator<String> it = node.fieldNames();
        while (it.hasNext()) {
            names.add(it.next());
        }
        return names;
    }
}
