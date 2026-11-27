package com.factoryfinance.treasury;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 账户 CRUD + 余额重算 + 参数校验 + 启停用。
 */
class AccountManagementIT extends TreasuryTestSupport {

    @Test
    void createListUpdateAndRecomputeBalance() throws Exception {
        HttpResult created = post("/api/v1/treasury/accounts", map(
                "name", "测试银行-" + System.nanoTime() % 100000,
                "accountType", "BANK",
                "openingBalance", "1000.00",
                "openingDate", day(0)));
        assertThat(created.status()).isEqualTo(200);
        assertThat(created.code()).isEqualTo("SUCCESS");
        long accountId = created.data().path("id").asLong();
        assertThat(created.dataText("currentBalance")).isEqualTo("1000.00");
        assertThat(created.dataText("accountNo")).startsWith("ACC-");
        assertThat(rawBalance(accountId)).isEqualByComparingTo("1000");

        // 一笔支出后余额由流水重算
        HttpResult expense = post("/api/v1/treasury/expenses", map(
                "category", "OTHER",
                "content", "账户重算测试支出",
                "payDate", day(0),
                "accountId", accountId,
                "amount", "200.00",
                "remark", "重算"));
        assertThat(expense.status()).isEqualTo(200);

        HttpResult list = get("/api/v1/treasury/accounts", Map.of("page", "1", "size", "100"));
        assertThat(list.status()).isEqualTo(200);
        JsonNode item = findAccount(list.data().path("items"), accountId);
        assertThat(item.path("currentBalance").asText()).isEqualTo("800.00");
        assertThat(dec(item.path("currentBalance").asText())).isEqualByComparingTo(rawBalance(accountId));

        // 更新：名称/备注
        HttpResult updated = put("/api/v1/treasury/accounts", map(
                "id", accountId,
                "name", "测试银行-改名",
                "remark", "更新备注"));
        assertThat(updated.status()).isEqualTo(200);
        assertThat(updated.dataText("name")).isEqualTo("测试银行-改名");
        assertThat(updated.dataText("remark")).isEqualTo("更新备注");
        assertThat(updated.dataText("currentBalance")).isEqualTo("800.00");
    }

    @Test
    void openingBalanceImmutableAfterTransactions() throws Exception {
        long accountId = seedAccount("期初锁定账户", "CASH", "500.00", day(0));

        assertThat(post("/api/v1/treasury/expenses", map(
                "category", "SUPPLIES",
                "content", "锁定期初",
                "payDate", day(0),
                "accountId", accountId,
                "amount", "10.00")).status()).isEqualTo(200);

        HttpResult update = put("/api/v1/treasury/accounts", map(
                "id", accountId,
                "openingBalance", "900.00"));
        assertThat(update.status()).isEqualTo(409);
        assertThat(update.code()).isEqualTo("CONFLICT");
    }

    @Test
    void invalidAmountAndDateRejected() throws Exception {
        // 小数位超精度（1.234）拒绝
        HttpResult r1 = post("/api/v1/treasury/accounts", map(
                "name", "非法金额1", "accountType", "BANK",
                "openingBalance", "1.234", "openingDate", day(0)));
        assertThat(r1.status()).isEqualTo(400);
        assertThat(r1.code()).isEqualTo("VALIDATION_ERROR");

        // 超出 DECIMAL(18,2) 整数范围（17 位整数）拒绝
        HttpResult r2 = post("/api/v1/treasury/accounts", map(
                "name", "非法金额2", "accountType", "BANK",
                "openingBalance", "99999999999999999.00", "openingDate", day(0)));
        assertThat(r2.status()).isEqualTo(400);
        assertThat(r2.code()).isEqualTo("VALIDATION_ERROR");

        // 科学计数法拒绝
        HttpResult r3 = post("/api/v1/treasury/accounts", map(
                "name", "非法金额3", "accountType", "BANK",
                "openingBalance", "1e3", "openingDate", day(0)));
        assertThat(r3.status()).isEqualTo(400);

        // 负数拒绝
        HttpResult r4 = post("/api/v1/treasury/accounts", map(
                "name", "非法金额4", "accountType", "BANK",
                "openingBalance", "-1.00", "openingDate", day(0)));
        assertThat(r4.status()).isEqualTo(400);

        // 未来日期拒绝
        HttpResult r5 = post("/api/v1/treasury/accounts", map(
                "name", "未来日期", "accountType", "BANK",
                "openingBalance", "0.00", "openingDate", businessTime.today().plusDays(1).toString()));
        assertThat(r5.status()).isEqualTo(400);
        assertThat(r5.code()).isEqualTo("VALIDATION_ERROR");

        // 日期格式非法拒绝
        HttpResult r6 = post("/api/v1/treasury/accounts", map(
                "name", "非法日期", "accountType", "BANK",
                "openingBalance", "0.00", "openingDate", "2026-13-01"));
        assertThat(r6.status()).isEqualTo(400);

        // 必填缺失（jakarta 校验）→ VALIDATION_ERROR
        HttpResult r7 = post("/api/v1/treasury/accounts", map(
                "accountType", "BANK", "openingBalance", "0.00", "openingDate", day(0)));
        assertThat(r7.status()).isEqualTo(400);
        assertThat(r7.code()).isEqualTo("VALIDATION_ERROR");

        // 类型非法
        HttpResult r8 = post("/api/v1/treasury/accounts", map(
                "name", "非法类型", "accountType", "BANKX",
                "openingBalance", "0.00", "openingDate", day(0)));
        assertThat(r8.status()).isEqualTo(400);
    }

    @Test
    void duplicateAccountNoReturnsConflict() throws Exception {
        String accountNo = "ACC-DUP-" + System.nanoTime() % 1000000;
        HttpResult first = post("/api/v1/treasury/accounts", map(
                "accountNo", accountNo, "name", "唯一编号账户",
                "accountType", "OTHER", "openingBalance", "0.00", "openingDate", day(0)));
        assertThat(first.status()).isEqualTo(200);

        HttpResult second = post("/api/v1/treasury/accounts", map(
                "accountNo", accountNo, "name", "唯一编号账户-重复",
                "accountType", "OTHER", "openingBalance", "0.00", "openingDate", day(0)));
        assertThat(second.status()).isEqualTo(409);
        assertThat(second.code()).isEqualTo("CONFLICT");
    }

    @Test
    void disabledAccountRejectsWritesAndIsReadable() throws Exception {
        HttpResult created = post("/api/v1/treasury/accounts", map(
                "name", "停用账户-" + System.nanoTime() % 100000,
                "accountType", "WECHAT",
                "openingBalance", "100.00",
                "openingDate", day(0)));
        long accountId = created.data().path("id").asLong();

        HttpResult disabled = put("/api/v1/treasury/accounts", map("id", accountId, "status", "DISABLED"));
        assertThat(disabled.status()).isEqualTo(200);
        assertThat(disabled.dataText("status")).isEqualTo("DISABLED");

        HttpResult write = post("/api/v1/treasury/expenses", map(
                "category", "OTHER", "content", "停用账户支出",
                "payDate", day(0), "accountId", accountId, "amount", "1.00"));
        assertThat(write.status()).isEqualTo(400);
        assertThat(write.code()).isEqualTo("VALIDATION_ERROR");
        assertThat(write.body().toString()).contains("已停用");
        assertThat(rawBalance(accountId)).isEqualByComparingTo("100");

        // 重新启用可继续使用
        assertThat(put("/api/v1/treasury/accounts", map("id", accountId, "status", "ENABLED")).status())
                .isEqualTo(200);
    }

    private static JsonNode findAccount(JsonNode items, long accountId) {
        for (JsonNode item : items) {
            if (item.path("id").asLong() == accountId) {
                return item;
            }
        }
        throw new AssertionError("账户未找到: " + accountId + " in " + items);
    }
}
