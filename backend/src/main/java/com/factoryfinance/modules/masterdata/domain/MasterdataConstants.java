package com.factoryfinance.modules.masterdata.domain;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 基础资料（客户/股东）公共常量与格式化。
 *
 * <p>业务编号规则：前缀 + 4 位起递增数字（CUS-0001 / SH-0001），
 * 服务端生成（确定性 max+1），编号唯一且不可变（API_CONTRACT §10）。
 * 公共格式化逻辑统一放这里，禁止在各服务复制。</p>
 */
public final class MasterdataConstants {

    /** 客户编号前缀 */
    public static final String CUSTOMER_NO_PREFIX = "CUS-";
    /** 股东编号前缀 */
    public static final String SHAREHOLDER_NO_PREFIX = "SH-";

    /** 客户编号正则（CUS- 加 4 位起数字） */
    public static final String CUSTOMER_NO_REGEX = "CUS-[0-9]{4,}";
    /** 股东编号正则（SH- 加 4 位起数字） */
    public static final String SHAREHOLDER_NO_REGEX = "SH-[0-9]{4,}";

    /** 可选客户编号正则：空串（自动编号）或合法编号 */
    public static final String CUSTOMER_NO_OPTIONAL_REGEX = "|" + CUSTOMER_NO_REGEX;
    /** 可选股东编号正则：空串（自动编号）或合法编号 */
    public static final String SHAREHOLDER_NO_OPTIONAL_REGEX = "|" + SHAREHOLDER_NO_REGEX;

    /** 记录状态取值 */
    public static final String STATUS_PATTERN = "ENABLED|DISABLED";
    /** 状态：启用 */
    public static final String STATUS_ENABLED = "ENABLED";
    /** 状态：停用 */
    public static final String STATUS_DISABLED = "DISABLED";

    /** 名称最大长度 */
    public static final int NAME_MAX = 128;
    /** 联系方式最大长度 */
    public static final int CONTACT_MAX = 128;
    /** 备注最大长度 */
    public static final int REMARK_MAX = 500;

    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private MasterdataConstants() {
    }

    /** 审计时间展示格式（yyyy-MM-dd HH:mm:ss） */
    public static String formatDateTime(LocalDateTime dateTime) {
        return dateTime == null ? null : DATE_TIME_FORMAT.format(dateTime);
    }

    /** 空白串归一为 null（contact/remark 清空语义） */
    public static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
