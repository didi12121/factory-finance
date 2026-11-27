package com.factoryfinance.modules.treasury.application;

import com.factoryfinance.common.api.ErrorCode;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.time.BusinessTime;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 资金业务输入校验（统一 VALIDATION_ERROR 语义，字段级 fieldErrors）。
 *
 * <p>金额红线：十进制字符串传输；最多 16 位整数、不超过 2 位小数（DECIMAL(18,2) 边界）；
 * 禁止科学计数法；金额恒 &gt; 0（流水金额）；禁止无依据舍入——超精度一律拒绝而非截断。</p>
 */
public final class TreasuryValidation {

    /** 16 位整数 + 可选 1-2 位小数（DECIMAL(18,2) 边界） */
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("^\\d{1,16}(\\.\\d{1,2})?$");
    private static final Pattern MONTH_PATTERN = Pattern.compile("^\\d{4}-\\d{2}$");

    private TreasuryValidation() {
    }

    /** 业务校验失败（VALIDATION_ERROR + fieldErrors） */
    public static BusinessException invalid(String field, String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, message,
                Map.of("fieldErrors", Map.of(field, message)));
    }

    /** 金额：必填、十进制字符串、≤16 位整数、≤2 位小数、> 0 */
    public static BigDecimal parseAmount(String raw, String field) {
        BigDecimal value = parseDecimalString(raw, field, "金额");
        if (value.signum() <= 0) {
            throw invalid(field, "金额必须大于 0");
        }
        return value;
    }

    /** 期初余额：同金额格式，允许 0 */
    public static BigDecimal parseOpeningAmount(String raw, String field) {
        BigDecimal value = parseDecimalString(raw, field, "期初余额");
        if (value.signum() < 0) {
            throw invalid(field, "期初余额不能为负数");
        }
        return value;
    }

    private static BigDecimal parseDecimalString(String raw, String field, String label) {
        if (raw == null || raw.isBlank()) {
            throw invalid(field, label + "必填");
        }
        String s = raw.trim();
        if (!AMOUNT_PATTERN.matcher(s).matches()) {
            throw invalid(field, label + "格式不合法：必须为十进制数字字符串（最多 16 位整数、不超过 2 位小数，禁止科学计数法）");
        }
        return new BigDecimal(s);
    }

    /** 日期：必填、YYYY-MM-DD 严格格式 */
    public static LocalDate parseDate(String raw, String field) {
        if (raw == null || raw.isBlank()) {
            throw invalid(field, "日期必填");
        }
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException ex) {
            throw invalid(field, "日期格式不合法：应为 YYYY-MM-DD");
        }
    }

    /** 业务日期不得晚于当前业务日期（BusinessTime 为唯一依据） */
    public static void requireNotAfterToday(BusinessTime businessTime, LocalDate date, String field) {
        if (!businessTime.notAfterToday(date)) {
            throw invalid(field, "业务日期不能晚于当前业务日期");
        }
    }

    /** 年月：YYYY-MM 严格格式 */
    public static String parseMonth(String raw, String field) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String s = raw.trim();
        if (!MONTH_PATTERN.matcher(s).matches()) {
            throw invalid(field, "月份格式不合法：应为 YYYY-MM");
        }
        int month = Integer.parseInt(s.substring(5, 7));
        if (month < 1 || month > 12) {
            throw invalid(field, "月份格式不合法：应为 YYYY-MM");
        }
        return s;
    }

    /** 文本：必填（可选）+ 长度上限 */
    public static String text(String raw, String field, int maxLength, boolean required) {
        if (raw == null || raw.isBlank()) {
            if (required) {
                throw invalid(field, field + "必填");
            }
            return null;
        }
        String s = raw.trim();
        if (s.length() > maxLength) {
            throw invalid(field, field + "长度不能超过 " + maxLength + " 个字符");
        }
        return s;
    }

    /** 客户端显式指定的单据编号格式（前缀-YYYYMM-序号，≤24 字符） */
    public static String docNo(String raw, String expectedPrefix) {
        String s = text(raw, "docNo", 24, false);
        if (s == null) {
            return null;
        }
        Pattern pattern = Pattern.compile("^" + Pattern.quote(expectedPrefix) + "-\\d{6}-\\d{1,8}$");
        if (!pattern.matcher(s).matches()) {
            throw invalid("docNo", "单据编号格式不合法：应为 " + expectedPrefix + "-YYYYMM-0001 形式");
        }
        return s;
    }

    /** 分页参数（统一分页约束：page ≥ 1，size 1-500） */
    public static void requirePaging(Integer page, Integer size) {
        if (page != null && page < 1) {
            throw invalid("page", "页码必须大于等于 1");
        }
        if (size != null && (size < 1 || size > 500)) {
            throw invalid("size", "每页条数必须在 1-500 之间");
        }
    }
}
