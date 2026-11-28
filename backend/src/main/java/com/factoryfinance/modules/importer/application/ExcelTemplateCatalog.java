package com.factoryfinance.modules.importer.application;

import com.factoryfinance.modules.importer.domain.ImportTemplate;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * 导入模板生成（.xlsx）：数据表（表头 + 示例行 + 填写说明表）。
 *
 * <p>模板与解析共用 {@link ImportTemplate} 定义，避免表头漂移。</p>
 */
@Component
public class ExcelTemplateCatalog {

    public String fileName(ImportTemplate template) {
        return "导入模板-" + template.displayName() + "-" + template.name().toLowerCase() + ".xlsx";
    }

    public byte[] build(ImportTemplate template) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);

            Sheet data = workbook.createSheet("数据");
            Row header = data.createRow(0);
            for (int i = 0; i < template.columns().size(); i++) {
                var column = template.columns().get(i);
                var cell = header.createCell(i);
                // 表头即契约（不含必填标记）：解析按表头文本严格匹配
                cell.setCellValue(column.header());
                cell.setCellStyle(headerStyle);
                data.setColumnWidth(i, 22 * 256);
            }

            Sheet guide = workbook.createSheet("填写说明");
            Row guideHeader = guide.createRow(0);
            String[] guideHeaders = {"列名", "是否必填", "格式", "示例值", "说明"};
            for (int i = 0; i < guideHeaders.length; i++) {
                var cell = guideHeader.createCell(i);
                cell.setCellValue(guideHeaders[i]);
                cell.setCellStyle(headerStyle);
                guide.setColumnWidth(i, 28 * 256);
            }
            int rowIndex = 1;
            for (var column : template.columns()) {
                Row row = guide.createRow(rowIndex++);
                row.createCell(0).setCellValue(column.header());
                row.createCell(1).setCellValue(column.required() ? "必填" : "选填");
                row.createCell(2).setCellValue(formatHint(column.type()));
                row.createCell(3).setCellValue(column.example());
                row.createCell(4).setCellValue(description(column.type(), column.header()));
            }
            Row notes = guide.createRow(rowIndex + 1);
            notes.createCell(0).setCellValue("通用约定");
            guide.createRow(rowIndex + 2).createCell(0)
                    .setCellValue("1. 第 1 行必须保留表头，数据从第 2 行开始；必填列见「填写说明」。");
            guide.createRow(rowIndex + 3).createCell(0)
                    .setCellValue("2. 金额为十进制数字（最多两位小数、不得为负），禁止使用千分位以外的格式。");
            guide.createRow(rowIndex + 4).createCell(0)
                    .setCellValue("3. 日期格式 YYYY-MM-DD，月份格式 YYYY-MM，均不得晚于当前业务日期。");
            guide.createRow(rowIndex + 5).createCell(0)
                    .setCellValue("4. 同一文件重复确认不会重复记账；内容完全相同的行按重复行处理。");

            workbook.write(out);
            return out.toByteArray();
        } catch (IOException ex) {
            throw new IllegalStateException("模板生成失败", ex);
        }
    }

    private static String formatHint(ImportTemplate.ColumnType type) {
        return switch (type) {
            case MONEY, OPENING_AMOUNT -> "十进制数字（两位小数）";
            case DATE -> "YYYY-MM-DD";
            case MONTH -> "YYYY-MM";
            case ACCOUNT_TYPE -> "BANK/CASH/WECHAT/ALIPAY/OTHER";
            case EXPENSE_CATEGORY -> "支出分类代码（PURCHASE/SALARY/ELECTRICITY/…）";
            default -> "文本";
        };
    }

    private static String description(ImportTemplate.ColumnType type, String header) {
        return switch (type) {
            case OPENING_AMOUNT -> "账户期初余额；历史流水日期不得早于期初日期（避免期初与流水重复计算）";
            case ACCOUNT_TYPE -> "银行/现金/微信/支付宝/其他";
            case EXPENSE_CATEGORY -> "采购=PURCHASE、工资=SALARY、电费=ELECTRICITY、水费=WATER、网络=INTERNET、房租=RENT、辅料=SUPPLIES、维修=REPAIR、运输=TRANSPORT、其他=OTHER";
            case TEXT -> switch (header) {
                case "资金账户", "付款账户", "收款账户" -> "已存在的资金账户名称（与账户管理一致）";
                case "股东名称", "客户名称", "供应商名称" -> "已存在的名称（导入前需先导入对应主数据）";
                case "核销对账单编号" -> "多个编号用英文逗号分隔，需与「核销金额」一一对应";
                case "核销金额" -> "与对账单编号顺序一致的金额，用英文逗号分隔；本阶段要求合计等于实收金额";
                default -> "文本";
            };
            default -> "文本";
        };
    }
}
