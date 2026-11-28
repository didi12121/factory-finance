package com.factoryfinance.modules.importer.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.modules.importer.api.dto.ImportViews.ImportBatchView;
import com.factoryfinance.modules.importer.api.dto.ImportViews.ImportPreviewView;
import com.factoryfinance.modules.importer.api.dto.ImportViews.ImportTemplateView;
import com.factoryfinance.modules.importer.api.dto.ImportViews.TemplateColumnView;
import com.factoryfinance.modules.importer.api.dto.ReconciliationView;
import com.factoryfinance.modules.importer.application.ImportService;
import com.factoryfinance.modules.importer.application.ReconciliationService;
import com.factoryfinance.modules.importer.domain.ImportTemplate;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Excel 数据迁移 API（/api/v1/import）。
 *
 * <p>流程：模板下载 → 上传预览（校验+重复识别，不落库）→ 确认导入（写业务单据，行级幂等）→ 批次记录 → 导入核对。</p>
 */
@Tag(name = "Excel 数据迁移", description = "模板下载、上传预览、确认导入、批次记录与导入核对")
@RestController
@RequestMapping("/api/v1/import")
public class ImportController {

    private final ImportService importService;
    private final ReconciliationService reconciliationService;

    public ImportController(ImportService importService, ReconciliationService reconciliationService) {
        this.importService = importService;
        this.reconciliationService = reconciliationService;
    }

    @GetMapping("/templates")
    @Operation(summary = "导入模板清单", description = "返回模板编码、名称与列定义")
    public ApiResponse<List<ImportTemplateView>> templates() {
        List<ImportTemplateView> views = importService.templates().stream()
                .map(template -> new ImportTemplateView(template.name(), template.displayName(),
                        template.columns().stream()
                                .map(column -> new TemplateColumnView(column.header(), column.required(),
                                        column.type().name(), column.example()))
                                .toList()))
                .toList();
        return ApiResponse.success(views);
    }

    @GetMapping("/templates/{code}/file")
    @Operation(summary = "下载导入模板（.xlsx）")
    public ResponseEntity<byte[]> downloadTemplate(@PathVariable String code) {
        ImportTemplate template = importService.requireTemplate(code);
        byte[] content = importService.templateFile(template);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(importService.templateFileName(template), StandardCharsets.UTF_8)
                .build());
        return ResponseEntity.ok().headers(headers).body(content);
    }

    @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "上传预览", description = "解析 + 字段校验 + 引用校验 + 重复识别；不落库、不产生业务单据")
    public ApiResponse<ImportPreviewView> preview(@RequestParam String templateCode,
                                                  @RequestParam("file") MultipartFile file) {
        return ApiResponse.success(importService.preview(importService.requireTemplate(templateCode), file));
    }

    @PostMapping(value = "/confirm", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "确认导入",
            description = "逐行调用业务服务写入；同一文件重复确认返回既有批次，不重复记账")
    public ApiResponse<ImportBatchView> confirm(@RequestParam String templateCode,
                                                @RequestParam("file") MultipartFile file) {
        return ApiResponse.success(importService.confirm(importService.requireTemplate(templateCode), file));
    }

    @GetMapping("/batches")
    @Operation(summary = "导入批次记录")
    public ApiResponse<List<ImportBatchView>> batches(@RequestParam(required = false) Integer limit) {
        return ApiResponse.success(importService.listBatches(limit == null ? 20 : limit));
    }

    @GetMapping("/batches/{id}")
    @Operation(summary = "导入批次明细（含逐行结果与失败原因）")
    public ApiResponse<ImportBatchView> batch(@PathVariable long id) {
        return ApiResponse.success(importService.getBatch(id));
    }

    @GetMapping("/reconciliation")
    @Operation(summary = "导入核对", description = "账户余额/总资金/客户应收/供应商应付/导入统计与差异提示")
    public ApiResponse<ReconciliationView> reconciliation() {
        return ApiResponse.success(reconciliationService.reconcile());
    }
}
