package com.factoryfinance.infrastructure.time;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 服务器业务时间（Asia/Shanghai）。
 *
 * <p>业务日期校验（如实际收付款日期不得晚于当前业务日期）必须使用本组件，
 * 禁止使用客户端时间或默认时区。</p>
 */
@Component
public class BusinessTime {

    public static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private final Clock clock;

    public BusinessTime() {
        this(Clock.system(BUSINESS_ZONE));
    }

    BusinessTime(Clock clock) {
        this.clock = clock;
    }

    /** 当前业务日期（Asia/Shanghai） */
    public LocalDate today() {
        return LocalDate.now(clock);
    }

    public Instant now() {
        return clock.instant();
    }

    /** 校验业务日期不晚于当前业务日期 */
    public boolean notAfterToday(LocalDate date) {
        return date != null && !date.isAfter(today());
    }
}
