package com.factoryfinance.common.validation;

import com.factoryfinance.common.api.ErrorCode;
import com.factoryfinance.common.exception.BusinessException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 业务输入校验公共规则（资金/应收/应付/核销共用）。
 *
 * <p>金额红线：十进制字符串传输；最多 16 位整数、不超过 2 位小数（DECIMAL(18,2) 边界）；
 * 禁止科学计数法；金额恒 &gt; 0（方向由业务字段表达）；超精度一律拒绝而非截断。</p>
 */
public final class ValidationRules {

    /** 16 位整数 + 可选 1-2 位小数（DECIMAL(18,2) 边界） */
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("^\\d{1,16}(\\.\\d{1,2})?$");
    private static final Pattern MONTH_PATTERN = Pattern.compile("^\\d{4}-\\d{2}$");

    private ValidationRules() {
    }

    /** 业务校验失败（VALIDATION_ERROR + fieldErrors） */
    public static BusinessException invalid(String field, String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, message,
                Map.of("fieldErrors", Map.of(field, message)));
    }

    /** 多字段校验失败（VALIDATION_ERROR + 多字段 fieldErrors） */
    public static BusinessException invalidFields(Map<String, String> fieldErrors) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR,
                ErrorCode.VALIDATION_ERROR.getDefaultMessage(), Map.of("fieldErrors", fieldErrors));
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

    /** 业务日期不得晚于当前业务日期 */
    public static void requireNotAfter(LocalDate date, LocalDate today, String field) {
        if (date == null || date.isAfter(today)) {
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

    /** 分页参数（统一分页约束：page ≥ 1，size 1-500） */
    public static void requirePaging(Integer page, Integer size) {
        if (page != null && page < 1) {
            throw invalid("page", "页码必须大于等于 1");
        }
        if (size != null && (size < 1 || size > 500)) {
            throw invalid("size", "每页条数必须在 1-500 之间");
        }
    }

    /** 十进制金额比较（A 需 ≥ B 等业务断言用） */
    public static boolean gte(BigDecimal left, BigDecimal right) {
        return left != null && right != null && left.compareTo(right) >= 0;
    }
}
