package com.factoryfinance.modules.importer.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Excel 导入模板定义（模板编码 + 中文表头 + 列类型/必填约束）。
 *
 * <p>模板表头即对用户暴露的契约：模板下载、解析、校验、错误行提示共用同一份定义，
 * 禁止各处重复维护列信息。</p>
 */
public enum ImportTemplate {

    CUSTOMER("客户", List.of(
            Column.required("客户名称", ColumnType.TEXT),
            Column.optional("联系人", ColumnType.TEXT),
            Column.optional("电话", ColumnType.TEXT),
            Column.optional("备注", ColumnType.TEXT))),

    SUPPLIER("供应商", List.of(
            Column.required("供应商名称", ColumnType.TEXT),
            Column.optional("联系人", ColumnType.TEXT),
            Column.optional("电话", ColumnType.TEXT),
            Column.optional("备注", ColumnType.TEXT))),

    SHAREHOLDER("股东", List.of(
            Column.required("股东名称", ColumnType.TEXT),
            Column.optional("联系方式", ColumnType.TEXT),
            Column.optional("备注", ColumnType.TEXT))),

    FUND_ACCOUNT("资金账户及期初余额", List.of(
            Column.required("账户名称", ColumnType.TEXT),
            Column.required("账户类型", ColumnType.ACCOUNT_TYPE),
            Column.required("期初余额", ColumnType.OPENING_AMOUNT),
            Column.required("期初日期", ColumnType.DATE),
            Column.optional("备注", ColumnType.TEXT))),

    CONTRIBUTION("股东出资", List.of(
            Column.required("原始记录标识", ColumnType.TEXT),
            Column.required("股东名称", ColumnType.TEXT),
            Column.required("出资日期", ColumnType.DATE),
            Column.required("资金账户", ColumnType.TEXT),
            Column.required("金额", ColumnType.MONEY),
            Column.optional("备注", ColumnType.TEXT))),

    EXPENSE("日常支出", List.of(
            Column.required("原始记录标识", ColumnType.TEXT),
            Column.required("支出分类", ColumnType.EXPENSE_CATEGORY),
            Column.required("支出内容", ColumnType.TEXT),
            Column.required("业务日期", ColumnType.DATE),
            Column.required("付款账户", ColumnType.TEXT),
            Column.required("金额", ColumnType.MONEY),
            Column.optional("交易对手", ColumnType.TEXT),
            Column.optional("员工名称", ColumnType.TEXT),
            Column.optional("工资月份", ColumnType.MONTH),
            Column.optional("备注", ColumnType.TEXT))),

    RECEIVABLE("应收账款", List.of(
            Column.required("原始记录标识", ColumnType.TEXT),
            Column.required("客户名称", ColumnType.TEXT),
            Column.required("所属月份", ColumnType.MONTH),
            Column.required("对账日期", ColumnType.DATE),
            Column.optional("到期日期", ColumnType.DATE),
            Column.required("应收金额", ColumnType.MONEY),
            Column.optional("备注", ColumnType.TEXT))),

    RECEIPT("加工费回款", List.of(
            Column.required("原始记录标识", ColumnType.TEXT),
            Column.required("客户名称", ColumnType.TEXT),
            Column.required("实际到账日期", ColumnType.DATE),
            Column.required("收款账户", ColumnType.TEXT),
            Column.required("实际收款金额", ColumnType.MONEY),
            Column.required("核销对账单编号", ColumnType.TEXT),
            Column.required("核销金额", ColumnType.TEXT),
            Column.optional("银行流水参考号", ColumnType.TEXT),
            Column.optional("备注", ColumnType.TEXT)));

    /** 列类型（决定校验规则与模板示例值） */
    public enum ColumnType {
        TEXT,
        MONEY,
        OPENING_AMOUNT,
        DATE,
        MONTH,
        ACCOUNT_TYPE,
        EXPENSE_CATEGORY
    }

    /** 模板列定义 */
    public record Column(String header, boolean required, ColumnType type, String example) {

        static Column required(String header, ColumnType type) {
            return new Column(header, true, type, exampleOf(type));
        }

        static Column optional(String header, ColumnType type) {
            return new Column(header, false, type, "");
        }

        private static String exampleOf(ColumnType type) {
            return switch (type) {
                case MONEY -> "1000.00";
                case OPENING_AMOUNT -> "0.00";
                case DATE -> "2026-11-01";
                case MONTH -> "2026-11";
                case ACCOUNT_TYPE -> "BANK";
                case EXPENSE_CATEGORY -> "PURCHASE";
                default -> "";
            };
        }
    }

    private final String displayName;
    private final List<Column> columns;

    ImportTemplate(String displayName, List<Column> columns) {
        this.displayName = displayName;
        this.columns = List.copyOf(columns);
    }

    public String displayName() {
        return displayName;
    }

    public List<Column> columns() {
        return columns;
    }

    /** 表头列表（顺序即模板列顺序） */
    public List<String> headers() {
        List<String> headers = new ArrayList<>();
        columns.forEach(column -> headers.add(column.header()));
        return headers;
    }

    public Optional<Column> column(String header) {
        return columns.stream().filter(column -> column.header().equals(header)).findFirst();
    }

    /**
     * 是否财务业务模板（出资/支出/应收/回款）。
     *
     * <p>财务模板按「原始记录标识」做幂等控制；主数据模板（客户/供应商/股东/资金账户）
     * 按业务名称去重，两套去重逻辑互不影响。</p>
     */
    public boolean isFinancial() {
        return this == CONTRIBUTION || this == EXPENSE || this == RECEIVABLE || this == RECEIPT;
    }

    /** 原始记录标识列名（财务模板必填） */
    public static final String SOURCE_REF_HEADER = "原始记录标识";

    public static Optional<ImportTemplate> of(String code) {
        if (code == null) {
            return Optional.empty();
        }
        for (ImportTemplate template : values()) {
            if (template.name().equalsIgnoreCase(code.trim())) {
                return Optional.of(template);
            }
        }
        return Optional.empty();
    }
}
