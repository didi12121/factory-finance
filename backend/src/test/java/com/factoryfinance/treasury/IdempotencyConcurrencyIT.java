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
 * 数据库级幂等与并发安全：
 * 1) 并发两线程同单据 → 仅一条流水，另一请求 409 CONFLICT；
 * 2) 同账户两笔并发 → 余额与独立重算一致；
 * 3) 顺序重复提交（同客户端单据编号）→ 409。
 * 业务日期取 T-4。
 */
class IdempotencyConcurrencyIT extends TreasuryTestSupport {

    @Autowired
    private ContributionService contributionService;

    @Autowired
    private ExpenseService expenseService;

    @Test
    void concurrentSameDocumentCreatesExactlyOneFlow() throws Exception {
        long shareholderId = seedShareholder("并发股东", "ENABLED");
        long accountId = createAccount("并发出资账户", "500.00");
        CreateContributionRequest request = new CreateContributionRequest(
                shareholderId, day(4), accountId, "1000.00", "并发同单据", null);

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
            AtomicInteger conflict = new AtomicInteger();
            String docNo = null;
            for (Future<Object> future : futures) {
                Object outcome = future.get();
                if (outcome instanceof BusinessException ex) {
                    conflict.incrementAndGet();
                    assertThat(ex.getErrorCode().name()).isEqualTo("CONFLICT");
                } else {
                    success.incrementAndGet();
                    docNo = ((ContributionView) outcome).docNo();
                }
            }
            assertThat(success.get()).as("同单据并发应恰有一笔成功").isEqualTo(1);
            assertThat(conflict.get()).as("另一笔应 409 CONFLICT").isEqualTo(1);

            // 数据库级断言：仅一条单据 + 一条流水
            Integer docs = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM tst_shareholder_contribution WHERE doc_no = ?", Integer.class, docNo);
            assertThat(docs).isEqualTo(1);
            Long docId = jdbcTemplate.queryForObject(
                    "SELECT id FROM tst_shareholder_contribution WHERE doc_no = ?", Long.class, docNo);
            assertThat(flowCount("CONTRIBUTION", docId)).isEqualTo(1);
            assertThat(rawBalance(accountId)).isEqualByComparingTo("1500");
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentDifferentExpensesOnSameAccountKeepBalanceConsistent() throws Exception {
        long accountId = createAccount("并发支出台账账户", "1000.00");
        CreateExpenseRequest first = new CreateExpenseRequest(
                "PURCHASE", "并发支出A", null, day(4), accountId, "100.00",
                "收款方A", null, null, null, "并发A", null);
        CreateExpenseRequest second = new CreateExpenseRequest(
                "RENT", "并发支出B", null, day(4), accountId, "250.00",
                "收款方B", null, null, null, "并发B", null);

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
                Object outcome = future.get();
                if (!(outcome instanceof BusinessException)) {
                    landed++;
                }
            }
            assertThat(landed).as("不同内容并发两笔应全部落库").isEqualTo(2);

            // 并发后余额 = 重算值（独立 SQL）
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
    void sequentialResubmissionWithSameClientDocNoRejected() throws Exception {
        long accountId = createAccount("顺序重复提交账户", "200.00");
        String docNo = "ZC-" + day(4).replace("-", "").substring(0, 6) + "-9002";
        Map<String, Object> body = map(
                "category", "OTHER", "content", "顺序重复", "payDate", day(4),
                "accountId", accountId, "amount", "20.00", "docNo", docNo);

        HttpResult first = post("/api/v1/treasury/expenses", body);
        assertThat(first.status()).isEqualTo(200);
        HttpResult second = post("/api/v1/treasury/expenses", body);
        assertThat(second.status()).isEqualTo(409);
        assertThat(second.code()).isEqualTo("CONFLICT");

        Integer docs = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM tst_expense WHERE doc_no = ?", Integer.class, docNo);
        assertThat(docs).isEqualTo(1);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("180");
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
