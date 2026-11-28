package com.factoryfinance.modules.treasury.application;

import com.factoryfinance.common.api.ErrorCode;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.common.validation.ValidationRules;
import com.factoryfinance.infrastructure.time.BusinessTime;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 资金业务输入校验（统一 VALIDATION_ERROR 语义，字段级 fieldErrors）。
 *
 * <p>实现下沉至 {@link ValidationRules}，本类保留资金模块调用点与业务日期校验重载：
 * 金额红线（十进制字符串、≤16 位整数、≤2 位小数、禁止科学计数法、金额恒 &gt; 0）。</p>
 */
public final class TreasuryValidation {

    private TreasuryValidation() {
    }

    /** 业务校验失败（VALIDATION_ERROR + fieldErrors） */
    public static BusinessException invalid(String field, String message) {
        return ValidationRules.invalid(field, message);
    }

    /** 金额：必填、十进制字符串、≤16 位整数、≤2 位小数、> 0 */
    public static BigDecimal parseAmount(String raw, String field) {
        return ValidationRules.parseAmount(raw, field);
    }

    /** 期初余额：同金额格式，允许 0 */
    public static BigDecimal parseOpeningAmount(String raw, String field) {
        return ValidationRules.parseOpeningAmount(raw, field);
    }

    /** 日期：必填、YYYY-MM-DD 严格格式 */
    public static LocalDate parseDate(String raw, String field) {
        return ValidationRules.parseDate(raw, field);
    }

    /** 业务日期不得晚于当前业务日期（BusinessTime 为唯一依据） */
    public static void requireNotAfterToday(BusinessTime businessTime, LocalDate date, String field) {
        ValidationRules.requireNotAfter(date, businessTime.today(), field);
    }

    /** 年月：YYYY-MM 严格格式 */
    public static String parseMonth(String raw, String field) {
        return ValidationRules.parseMonth(raw, field);
    }

    /** 文本：必填（可选）+ 长度上限 */
    public static String text(String raw, String field, int maxLength, boolean required) {
        return ValidationRules.text(raw, field, maxLength, required);
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
        ValidationRules.requirePaging(page, size);
    }

    /** 资金业务日期规则：不得早于账户期初日期（资金账户余额重算基准） */
    public static void requireNotBeforeOpening(LocalDate businessDate, LocalDate openingDate, String field) {
        if (openingDate != null && businessDate.isBefore(openingDate)) {
            throw invalid(field, "业务日期不能早于资金账户期初日期（" + openingDate + "）");
        }
    }

    /** 撤销日期规则：不得早于原业务日期 */
    public static void requireVoidNotBeforeBusiness(LocalDate voidDate, LocalDate businessDate) {
        if (businessDate != null && voidDate.isBefore(businessDate)) {
            throw invalid("voidDate", "撤销日期不能早于原业务日期（" + businessDate + "）");
        }
    }

    /** 字段级错误详情（多字段） */
    public static BusinessException invalidFields(Map<String, String> fieldErrors) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR,
                ErrorCode.VALIDATION_ERROR.getDefaultMessage(), Map.of("fieldErrors", fieldErrors));
    }
}
