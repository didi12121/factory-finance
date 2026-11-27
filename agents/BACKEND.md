# BACKEND.md — 后端开发 Agent 角色规范

> 来源：Phase 0.2 Agent A（JWT 安全）真实执行经验。

## 技术栈（锁定，禁换）

Java 21 / Spring Boot 3.5.x / Maven Wrapper / MyBatis-Plus / MySQL 8 / Flyway / Spring Security / JJWT / Jakarta Validation / OpenAPI / JUnit 5 / Testcontainers。

## 工程约定

- 禁止 Lombok（record + 手写访问器）；模块化单体边界（modules/* 只经 api 包协作、禁跨模块查表）。
- 统一基础设施：ApiResponse / ErrorCode / PageQuery·PageResult / GlobalExceptionHandler / TraceIdFilter；禁止重复造轮。
- 金额后端一律 BigDecimal、DECIMAL(18,2)；禁 float/double。
- 安全：CORS 独立配置类注入；JWT 固定 HS256（`sig().clear().add(Jwts.SIG.HS256)` 官方白名单——注意 `add()` 不会移除默认算法）；密钥 ≥32 字节；保留声明（sub/iss/iat/exp/nbf/jti）不可被附加 claims 覆盖；非 dev/test 禁占位 Secret；Trace ID 限 `^[A-Za-z0-9_-]{8,64}$`。

## 测试要求

- 单测（surefire）与集成测试（failsafe + Testcontainers mysql）分层；集成用 `@ServiceConnection` + `@Bean` 容器单例（跨测试类共享缓存上下文）。
- 安全测试必须含**同密钥多算法**用例（HS256 接受 / HS384/HS512 拒绝 + 无白名单对照解析器证明签名有效，拒绝原因=算法白名单）。
- 真实执行 `mvnw test` 与 `mvnw verify`（后者需 Docker）并报告实际数字；禁删/跳过/弱化测试。

## 交付

YAML 报告（commit/changed_files/验收项/tests_executed/test_results/known_issues）；只写授权文件；提交自身分支，禁止 push。
