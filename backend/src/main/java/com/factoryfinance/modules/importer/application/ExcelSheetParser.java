package com.factoryfinance.modules.importer.application;

import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.modules.importer.domain.ImportTemplate;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Excel 解析（.xlsx）：按模板表头读取数据行，单元格统一转文本。
 *
 * <p>约定：第 1 行为表头，必须与模板表头完全一致（顺序无关，缺列/多列均报错）；
 * 空行跳过；日期单元格（Excel 日期格式）转换为 YYYY-MM-DD；金额保留原始文本，
 * 由业务校验统一解析（禁止在此做财务运算）。</p>
 */
@Component
public class ExcelSheetParser {

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final int MAX_ROWS = 5000;

    /** 解析出的数据行 */
    public record ParsedRow(int rowNo, Map<String, String> values) {
    }

    public List<ParsedRow> parse(ImportTemplate template, byte[] content) {
        if (content == null || content.length == 0) {
            throw BusinessException.conflict("上传文件为空，请下载模板后填写");
        }
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(content))) {
            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(sheet.getFirstRowNum());
            if (headerRow == null) {
                throw BusinessException.conflict("模板表头缺失：第 1 行应为模板表头");
            }
            DataFormatter formatter = new DataFormatter();
            Map<Integer, String> headerByIndex = new LinkedHashMap<>();
            List<String> missing = new ArrayList<>(template.headers());
            for (int i = headerRow.getFirstCellNum(); i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                String header = cell == null ? "" : formatter.formatCellValue(cell).trim();
                if (header.isEmpty()) {
                    continue;
                }
                if (template.column(header).isEmpty()) {
                    throw BusinessException.conflict("模板不匹配：存在未知列「" + header + "」");
                }
                headerByIndex.put(i, header);
                missing.remove(header);
            }
            if (!missing.isEmpty()) {
                throw BusinessException.conflict("模板不匹配：缺少列「" + String.join("、", missing) + "」");
            }

            List<ParsedRow> rows = new ArrayList<>();
            for (int r = headerRow.getRowNum() + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) {
                    continue;
                }
                Map<String, String> values = new LinkedHashMap<>();
                boolean blank = true;
                for (Map.Entry<Integer, String> entry : headerByIndex.entrySet()) {
                    String value = cellText(row.getCell(entry.getKey()), formatter);
                    values.put(entry.getValue(), value);
                    if (!value.isEmpty()) {
                        blank = false;
                    }
                }
                if (blank) {
                    continue;
                }
                rows.add(new ParsedRow(r + 1, values));
                if (rows.size() > MAX_ROWS) {
                    throw BusinessException.conflict("单次导入最多 " + MAX_ROWS + " 行，请拆分文件后分批导入");
                }
            }
            return rows;
        } catch (IOException | RuntimeException ex) {
            if (ex instanceof BusinessException businessException) {
                throw businessException;
            }
            throw BusinessException.conflict("文件解析失败：请使用模板下载的 .xlsx 文件（" + ex.getMessage() + "）");
        }
    }

    private static String cellText(Cell cell, DataFormatter formatter) {
        if (cell == null) {
            return "";
        }
        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            LocalDate date = cell.getLocalDateTimeCellValue().toLocalDate();
            return ISO_DATE.format(date);
        }
        if (cell.getCellType() == CellType.FORMULA) {
            return formatter.formatCellValue(cell, cell.getSheet().getWorkbook().getCreationHelper()
                    .createFormulaEvaluator()).trim();
        }
        return formatter.formatCellValue(cell).trim();
    }
}
