package com.factoryfinance.importer;

import com.factoryfinance.receivable.Phase2TestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Excel 数据迁移（MVP 上线准备 §3/§4）：
 * <ol>
 *   <li>模板预览不落库；确认导入经真实业务服务写入；同一文件重复确认不重复记账；</li>
 *   <li>校验失败行给出原因且不产生任何业务数据（失败行零残留）；</li>
 *   <li>历史回款导入保留「一笔收款核销多张应收单」的核销关系；</li>
 *   <li>文件内重复行跳过；</li>
 *   <li>导入核对读取真实数据（账户余额/应收/应付/导入统计）。</li>
 * </ol>
 */
class ExcelImportIT extends Phase2TestSupport {

    @Test
    void customerImportIsPreviewedThenImportedIdempotently() throws Exception {
        String suffix = java.util.UUID.randomUUID().toString().substring(0, 8);
        byte[] file = xlsx(new String[]{"客户名称", "联系人", "电话", "备注"},
                new String[][]{
                        {"导入客户甲-" + suffix, "张三", "13800000001", "Excel 导入"},
                        {"导入客户乙-" + suffix, "李四", "13800000002", ""},
                });

        JsonNode preview = multipart("/api/v1/import/preview", "CUSTOMER", file).data();
        assertThat(preview.path("totalRows").asInt()).isEqualTo(2);
        assertThat(preview.path("validRows").asInt()).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM mst_customer WHERE name LIKE ?", "导入客户%-" + suffix))
                .as("预览不得写入数据").isZero();

        JsonNode batch = multipart("/api/v1/import/confirm", "CUSTOMER", file).data();
        assertThat(batch.path("successRows").asInt()).isEqualTo(2);
        assertThat(batch.path("failedRows").asInt()).isZero();
        assertThat(batch.path("reused").asBoolean()).isFalse();
        assertThat(count("SELECT COUNT(*) FROM mst_customer WHERE name LIKE ?", "导入客户%-" + suffix))
                .isEqualTo(2);

        // 同一文件重复确认：返回既有批次，不重复建单
        JsonNode replay = multipart("/api/v1/import/confirm", "CUSTOMER", file).data();
        assertThat(replay.path("batchNo").asText()).isEqualTo(batch.path("batchNo").asText());
        assertThat(replay.path("reused").asBoolean()).isTrue();
        assertThat(count("SELECT COUNT(*) FROM mst_customer WHERE name LIKE ?", "导入客户%-" + suffix))
                .isEqualTo(2);
    }

    @Test
    void invalidRowsReportReasonAndCreateNothing() throws Exception {
        long shareholderId = seedShareholder("导入股东", "ENABLED");
        long accountId = seedAccount("导入出资账户", "BANK", "0.00", today());
        String suffix = java.util.UUID.randomUUID().toString().substring(0, 8);

        byte[] file = xlsx(new String[]{"股东名称", "出资日期", "资金账户", "金额", "备注"},
                new String[][]{
                        {"导入股东", today(), "导入出资账户", "1000.00", "有效行-" + suffix},
                        {"不存在的股东-" + suffix, today(), "导入出资账户", "500.00", "无效行"},
                });

        JsonNode preview = multipart("/api/v1/import/preview", "CONTRIBUTION", file).data();
        assertThat(preview.path("validRows").asInt()).isEqualTo(1);
        assertThat(preview.path("invalidRows").asInt()).isEqualTo(1);
        assertThat(preview.path("rows").get(1).path("messages").toString()).contains("股东");

        JsonNode batch = multipart("/api/v1/import/confirm", "CONTRIBUTION", file).data();
        assertThat(batch.path("successRows").asInt()).isEqualTo(1);
        assertThat(batch.path("failedRows").asInt()).isEqualTo(1);

        assertThat(count("SELECT COUNT(*) FROM tst_shareholder_contribution WHERE shareholder_id = ?",
                shareholderId)).as("仅有效行生成出资单").isEqualTo(1);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("1000");
        assertThat(count("SELECT COUNT(*) FROM tst_fund_transaction WHERE account_id = ?", accountId))
                .as("失败行不产生任何资金流水").isEqualTo(1);
    }

    @Test
    void receiptImportPreservesHistoricalAllocations() throws Exception {
        long customerId = seedCustomer("导入回款客户");
        long accountId = seedAccount("导入回款账户", "BANK", "0.00", today());
        JsonNode first = createReceivable(customerId, "8000.00");
        JsonNode second = createReceivable(customerId, "12000.00");
        String customerName = get("/api/v1/masterdata/customers?page=1&size=500").data().path("items")
                .findValuesAsText("name").stream()
                .filter(name -> name.startsWith("导入回款客户"))
                .findFirst().orElseThrow();

        byte[] file = xlsx(
                new String[]{"客户名称", "实际到账日期", "收款账户", "实际收款金额",
                        "核销对账单编号", "核销金额", "银行流水参考号", "备注"},
                new String[][]{
                        {customerName, today(), "导入回款账户", "15000.00",
                                first.path("statementNo").asText() + "," + second.path("statementNo").asText(),
                                "8000.00,7000.00", "IMP-REF-1", "历史回款导入"},
                });

        JsonNode batch = multipart("/api/v1/import/confirm", "RECEIPT", file).data();
        assertThat(batch.path("successRows").asInt()).as("回款行导入成功：%s", batch).isEqualTo(1);

        assertThat(rawBalance(accountId)).as("一笔收款只记一次资金流入").isEqualByComparingTo("15000");
        assertThat(rawOutstanding(first.path("id").asLong())).isEqualByComparingTo("0");
        assertThat(rawOutstanding(second.path("id").asLong())).isEqualByComparingTo("5000");
        assertThat(count("SELECT COUNT(*) FROM rcv_receipt_allocation a JOIN rcv_receipt r ON r.id = a.receipt_id "
                + "WHERE r.account_id = ? AND a.status = 'ACTIVE'", accountId))
                .as("核销关系保留两笔").isEqualTo(2);
    }

    @Test
    void duplicateRowsWithinFileAreSkipped() throws Exception {
        String suffix = java.util.UUID.randomUUID().toString().substring(0, 8);
        byte[] file = xlsx(new String[]{"供应商名称", "联系人", "电话", "备注"},
                new String[][]{
                        {"导入供应商-" + suffix, "王五", "", ""},
                        {"导入供应商-" + suffix, "王五", "", ""},
                });

        JsonNode preview = multipart("/api/v1/import/preview", "SUPPLIER", file).data();
        assertThat(preview.path("duplicateRows").asInt()).as("文件内重复行被识别").isEqualTo(1);

        JsonNode batch = multipart("/api/v1/import/confirm", "SUPPLIER", file).data();
        assertThat(batch.path("successRows").asInt()).isEqualTo(1);
        assertThat(batch.path("duplicateRows").asInt()).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM mst_supplier WHERE name = ?", "导入供应商-" + suffix))
                .isEqualTo(1);
    }

    @Test
    void accountAndReconciliationReflectImportedOpeningBalance() throws Exception {
        String suffix = java.util.UUID.randomUUID().toString().substring(0, 8);
        byte[] file = xlsx(new String[]{"账户名称", "账户类型", "期初余额", "期初日期", "备注"},
                new String[][]{
                        {"导入期初账户-" + suffix, "BANK", "1234.56", today(), "历史期初"},
                });

        JsonNode batch = multipart("/api/v1/import/confirm", "FUND_ACCOUNT", file).data();
        assertThat(batch.path("successRows").asInt()).isEqualTo(1);

        JsonNode reconciliation = get("/api/v1/import/reconciliation").data();
        JsonNode accounts = reconciliation.path("accounts");
        boolean found = false;
        for (JsonNode account : accounts) {
            if (("导入期初账户-" + suffix).equals(account.path("name").asText())) {
                found = true;
                assertThat(account.path("openingBalance").asText()).isEqualTo("1234.56");
                assertThat(account.path("balance").asText()).isEqualTo("1234.56");
            }
        }
        assertThat(found).as("核对结果包含导入的账户").isTrue();
        assertThat(reconciliation.path("importStats").path("successRows").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(reconciliation.path("totalFundBalance").asText()).isNotBlank();
    }

    /* ------------------------------ 辅助 ------------------------------ */

    private HttpResult multipart(String path, String templateCode, byte[] file) throws Exception {
        MockMultipartFile upload = new MockMultipartFile("file", "import.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file);
        MvcResult result = mockMvc.perform(MockMvcRequestBuilders.multipart(path)
                        .file(upload)
                        .param("templateCode", templateCode)
                        .header("Authorization", authHeader())
                        .contentType(MediaType.MULTIPART_FORM_DATA))
                .andReturn();
        String content = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = content == null || content.isBlank()
                ? objectMapper.createObjectNode()
                : objectMapper.readTree(content);
        return new HttpResult(result.getResponse().getStatus(), node);
    }

    private static byte[] xlsx(String[] headers, String[][] rows) throws Exception {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("数据");
            Row header = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                header.createCell(i).setCellValue(headers[i]);
            }
            for (int r = 0; r < rows.length; r++) {
                Row row = sheet.createRow(r + 1);
                for (int c = 0; c < rows[r].length; c++) {
                    row.createCell(c).setCellValue(rows[r][c]);
                }
            }
            workbook.write(out);
            return out.toByteArray();
        }
    }

    /** 供断言：模板清单包含 8 类模板 */
    @Test
    void templateCatalogExposesAllSupportedTemplates() throws Exception {
        JsonNode templates = get("/api/v1/import/templates").data();
        List<String> codes = templates.findValuesAsText("code");
        assertThat(codes).contains("CUSTOMER", "SUPPLIER", "SHAREHOLDER", "FUND_ACCOUNT",
                "CONTRIBUTION", "EXPENSE", "RECEIVABLE", "RECEIPT");
    }
}
