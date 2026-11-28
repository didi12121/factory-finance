package com.factoryfinance.treasury;

import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.security.CurrentUser;
import com.factoryfinance.modules.treasury.api.dto.ContributionView;
import com.factoryfinance.modules.treasury.api.dto.CreateContributionRequest;
import com.factoryfinance.modules.treasury.api.dto.CreateExpenseRequest;
import com.factoryfinance.modules.treasury.application.ContributionService;
import com.factoryfinance.modules.treasury.application.ExpenseService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 请求幂等（独立于业务单据编号）+ 并发安全：
 * <ol>
 *   <li>并发同幂等键 → 仅生成一张单据与一条流水（两请求均返回同一单据）；</li>
 *   <li>不同幂等键的相同业务内容 → 允许各自正常提交（业务内容不参与幂等判断）；</li>
 *   <li>同键异参 → 409 CONFLICT；</li>
 *   <li>同账户并发两笔不同业务 → 余额与独立 SQL 重算一致；</li>
 *   <li>同客户端单据编号、不同幂等键 → 409（编号唯一键为最终防线）。</li>
 * </ol>
 * 业务日期取 T-4。
 */
class IdempotencyConcurrencyIT extends TreasuryTestSupport {

    @Autowired
    private ContributionService contributionService;

    @Autowired
    private ExpenseService expenseService;

    @Test
    void concurrentSameIdempotencyKeyCreatesExactlyOneDocumentAndFlow() throws Exception {
        long shareholderId = seedShareholder("并发股东", "ENABLED");
        long accountId = createAccount("并发出资账户", "500.00");
        String idemKey = newIdempotencyKey();
        CreateContributionRequest request = new CreateContributionRequest(
                shareholderId, day(4), accountId, "1000.00", "并发同键", null, idemKey);

        CyclicBarrier barrier = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Object>> tasks = List.of(
                    callAsOperator(() -> {
                        barrier.await(10, TimeUnit.SECONDS);
                        return contributionService.create(request);
                    }),
                    callAsOperator(() -> {
                        barrier.await(10, TimeUnit.SECONDS);
                        return contributionService.create(request);
                    }));
            List<Future<Object>> futures = pool.invokeAll(tasks, 30, TimeUnit.SECONDS);

            AtomicInteger success = new AtomicInteger();
            String docNo = null;
            for (Future<Object> future : futures) {
                Object outcome = future.get();
                assertThat(outcome).as("同幂等键并发不得抛错（应返回同一单据）")
                        .isNotInstanceOf(BusinessException.class);
                success.incrementAndGet();
                docNo = ((ContributionView) outcome).docNo();
            }
            assertThat(success.get()).isEqualTo(2);
            assertThat(docNo).isNotNull();

            Integer docs = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM tst_shareholder_contribution WHERE doc_no = ?", Integer.class, docNo);
            assertThat(docs).as("同键只允许一张单据").isEqualTo(1);
            Long docId = jdbcTemplate.queryForObject(
                    "SELECT id FROM tst_shareholder_contribution WHERE doc_no = ?", Long.class, docNo);
            assertThat(flowCount("CONTRIBUTION", docId)).as("同键只允许一条资金流水").isEqualTo(1);
            assertThat(rawBalance(accountId)).isEqualByComparingTo("1500");

            Integer idemRows = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_request_idempotency WHERE operation = 'CONTRIBUTION_CREATE' "
                            + "AND idem_key = ?",
                    Integer.class, idemKey);
            assertThat(idemRows).as("幂等键仅占位一条").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void differentKeysWithSameContentCreateSeparateDocuments() throws Exception {
        long shareholderId = seedShareholder("同内容股东", "ENABLED");
        long accountId = createAccount("同内容账户", "0.00");

        Map<String, Object> body = map(
                "shareholderId", shareholderId, "contributionDate", day(4), "accountId", accountId,
                "amount", "300.00", "remark", "相同业务内容");
        HttpResult first = post("/api/v1/treasury/contributions", body);
        HttpResult second = post("/api/v1/treasury/contributions", body);
        assertThat(first.status()).isEqualTo(200);
        assertThat(second.status()).as("不同幂等键的相同业务内容允许正常提交").isEqualTo(200);
        assertThat(first.dataText("docNo")).isNotEqualTo(second.dataText("docNo"));

        Integer docs = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM tst_shareholder_contribution WHERE remark = '相同业务内容'", Integer.class);
        assertThat(docs).isEqualTo(2);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("600");
    }

    @Test
    void sameKeyWithDifferentPayloadRejected() throws Exception {
        long shareholderId = seedShareholder("异参股东", "ENABLED");
        long accountId = createAccount("异参账户", "0.00");
        String idemKey = newIdempotencyKey();

        HttpResult first = post("/api/v1/treasury/contributions", map(
                "shareholderId", shareholderId, "contributionDate", day(4), "accountId", accountId,
                "amount", "100.00", "idempotencyKey", idemKey));
        assertThat(first.status()).isEqualTo(200);

        HttpResult second = post("/api/v1/treasury/contributions", map(
                "shareholderId", shareholderId, "contributionDate", day(4), "accountId", accountId,
                "amount", "999.00", "idempotencyKey", idemKey));
        assertThat(second.status()).as("同键异参必须拒绝").isEqualTo(409);
        assertThat(second.code()).isEqualTo("CONFLICT");
        assertThat(rawBalance(accountId)).isEqualByComparingTo("100");
    }

    @Test
    void sequentialResubmissionWithSameKeyReturnsOriginalDocument() throws Exception {
        long accountId = createAccount("顺序幂等账户", "200.00");
        String idemKey = newIdempotencyKey();
        Map<String, Object> body = map(
                "category", "OTHER", "content", "顺序重复", "payDate", day(4),
                "accountId", accountId, "amount", "20.00", "idempotencyKey", idemKey);

        HttpResult first = post("/api/v1/treasury/expenses", body);
        HttpResult second = post("/api/v1/treasury/expenses", body);
        assertThat(first.status()).isEqualTo(200);
        assertThat(second.status()).as("同键同参重复提交应返回原单据").isEqualTo(200);
        assertThat(second.dataText("docNo")).isEqualTo(first.dataText("docNo"));

        Integer docs = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM tst_expense WHERE doc_no = ?", Integer.class, first.dataText("docNo"));
        assertThat(docs).isEqualTo(1);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("180");
    }

    @Test
    void sameClientDocNoWithDifferentKeysRejected() throws Exception {
        long accountId = createAccount("重复编号账户", "200.00");
        // 测试库跨运行累积数据：单据编号附加随机段，保证每次运行编号唯一
        String docNo = "ZC-" + day(4).replace("-", "").substring(0, 6) + "-"
                + (100000 + java.util.concurrent.ThreadLocalRandom.current().nextInt(800000));
        Map<String, Object> body = map(
                "category", "OTHER", "content", "重复编号", "payDate", day(4),
                "accountId", accountId, "amount", "20.00", "docNo", docNo);

        HttpResult first = post("/api/v1/treasury/expenses", body);
        assertThat(first.status()).isEqualTo(200);
        HttpResult second = post("/api/v1/treasury/expenses", body);
        assertThat(second.status()).as("单据编号唯一键仍为最终防线").isEqualTo(409);
        assertThat(second.code()).isEqualTo("CONFLICT");

        Integer docs = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM tst_expense WHERE doc_no = ?", Integer.class, docNo);
        assertThat(docs).isEqualTo(1);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("180");
    }

    @Test
    void concurrentDifferentExpensesOnSameAccountKeepBalanceConsistent() throws Exception {
        long accountId = createAccount("并发支出台账账户", "1000.00");
        CreateExpenseRequest first = new CreateExpenseRequest(
                "PURCHASE", "并发支出A", null, day(4), accountId, "100.00",
                "收款方A", null, null, null, "并发A", null, newIdempotencyKey());
        CreateExpenseRequest second = new CreateExpenseRequest(
                "RENT", "并发支出B", null, day(4), accountId, "250.00",
                "收款方B", null, null, null, "并发B", null, newIdempotencyKey());

        CyclicBarrier barrier = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Object>> tasks = List.of(
                    callAsOperator(() -> {
                        barrier.await(10, TimeUnit.SECONDS);
                        return expenseService.create(first);
                    }),
                    callAsOperator(() -> {
                        barrier.await(10, TimeUnit.SECONDS);
                        return expenseService.create(second);
                    }));
            List<Future<Object>> futures = pool.invokeAll(tasks, 30, TimeUnit.SECONDS);

            int landed = 0;
            for (Future<Object> future : futures) {
                if (!(future.get() instanceof BusinessException)) {
                    landed++;
                }
            }
            assertThat(landed).as("不同内容并发两笔应全部落库").isEqualTo(2);

            BigDecimal recomputed = rawBalance(accountId);
            assertThat(recomputed).as("1000 − 100 − 250").isEqualByComparingTo("650");
            Integer flows = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM tst_fund_transaction WHERE account_id = ?", Integer.class, accountId);
            assertThat(flows).isEqualTo(2);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void missingIdempotencyKeyRejected() throws Exception {
        long accountId = createAccount("缺键账户", "100.00");
        HttpResult result = post("/api/v1/treasury/expenses", map(
                "category", "OTHER", "content", "缺键", "payDate", day(4),
                "accountId", accountId, "amount", "10.00", "idempotencyKey", ""));
        assertThat(result.status()).isEqualTo(400);
        assertThat(result.code()).isEqualTo("VALIDATION_ERROR");
        assertThat(rawBalance(accountId)).isEqualByComparingTo("100");
    }

    private long createAccount(String name, String opening) throws Exception {
        HttpResult result = post("/api/v1/treasury/accounts", map(
                "name", name, "accountType", "BANK",
                "openingBalance", opening, "openingDate", day(4)));
        assertThat(result.status()).isEqualTo(200);
        return result.data().path("id").asLong();
    }

    /** 在独立线程中以操作人身份执行（审计字段取 SecurityContext） */
    private static <T> Callable<Object> callAsOperator(ThrowingSupplier<T> action) {
        return () -> {
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(
                            new CurrentUser("treasury-tester", "资金测试员"), null, List.of()));
            try {
                return action.get();
            } catch (BusinessException ex) {
                return ex;
            } finally {
                SecurityContextHolder.clearContext();
            }
        };
    }

    @FunctionalInterface
    private interface ThrowingSupplier<T> {
        T get() throws Exception;
    }
}
