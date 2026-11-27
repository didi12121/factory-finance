package com.factoryfinance.modules.treasury.application;

import com.factoryfinance.modules.treasury.domain.DocSeries;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ExpenseMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundAccountMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ShareholderContributionMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.TransferMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.VoidRecordMapper;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * 单据编号确定性序列：前缀 + YYYYMM + 4 位序号（CZ/ZC/ZZ/VN），账户编号 ACC-0001 起。
 *
 * <p>"确定性"指同一业务日期月份内按现有最大序号递增，编号一经生成不可变。
 * 快照读取分配序号；同内容重复提交命中同一编号时由数据库唯一键拦截（→ 409），
 * 不同内容并发冲突时以锁定读取（FOR UPDATE）重新分配序号，互不丢失单据。</p>
 */
@Component
public class DocNoGenerator {

    private final ShareholderContributionMapper contributionMapper;
    private final ExpenseMapper expenseMapper;
    private final TransferMapper transferMapper;
    private final VoidRecordMapper voidRecordMapper;
    private final FundAccountMapper accountMapper;

    public DocNoGenerator(ShareholderContributionMapper contributionMapper,
                          ExpenseMapper expenseMapper,
                          TransferMapper transferMapper,
                          VoidRecordMapper voidRecordMapper,
                          FundAccountMapper accountMapper) {
        this.contributionMapper = contributionMapper;
        this.expenseMapper = expenseMapper;
        this.transferMapper = transferMapper;
        this.voidRecordMapper = voidRecordMapper;
        this.accountMapper = accountMapper;
    }

    /** 快照分配（默认路径） */
    public String next(DocSeries series, LocalDate bizDate) {
        String prefix = prefixOf(series.prefix(), bizDate);
        return nextSeq(prefix, maxSeq(series, prefix, false));
    }

    /** 锁定分配（并发冲突后的不同内容重试路径，读取最新已提交序号） */
    public String nextForUpdate(DocSeries series, LocalDate bizDate) {
        String prefix = prefixOf(series.prefix(), bizDate);
        return nextSeq(prefix, maxSeq(series, prefix, true));
    }

    /** 资金账户编号 ACC-0001 起（快照分配；重复由唯一键 → 409） */
    public String nextAccountNo() {
        String prefix = "ACC-";
        return nextSeq(prefix, accountMapper.selectMaxSeq(prefix));
    }

    /** 撤销单号 VN-YYYYMM-0001 */
    public String nextVoidNo(LocalDate voidDate) {
        String prefix = prefixOf(DocSeries.VOID.prefix(), voidDate);
        return nextSeq(prefix, voidRecordMapper.selectMaxSeq(prefix));
    }

    /** 流水编号：单据号 + 序位（如 CZ-202611-0001-1），确定性且唯一 */
    public String transactionNo(String docNo, int index) {
        return docNo + "-" + index;
    }

    private Long maxSeq(DocSeries series, String prefix, boolean locking) {
        return switch (series) {
            case CONTRIBUTION -> locking
                    ? contributionMapper.selectMaxSeqForUpdate(prefix)
                    : contributionMapper.selectMaxSeq(prefix);
            case EXPENSE -> locking
                    ? expenseMapper.selectMaxSeqForUpdate(prefix)
                    : expenseMapper.selectMaxSeq(prefix);
            case TRANSFER -> locking
                    ? transferMapper.selectMaxSeqForUpdate(prefix)
                    : transferMapper.selectMaxSeq(prefix);
            case VOID -> locking
                    ? voidRecordMapper.selectMaxSeqForUpdate(prefix)
                    : voidRecordMapper.selectMaxSeq(prefix);
        };
    }

    private static String prefixOf(String seriesPrefix, LocalDate bizDate) {
        return seriesPrefix + "-" + String.format("%04d%02d-", bizDate.getYear(), bizDate.getMonthValue());
    }

    private static String nextSeq(String prefix, Long maxSeq) {
        long next = (maxSeq == null ? 0L : maxSeq) + 1;
        return prefix + String.format("%04d", next);
    }
}
