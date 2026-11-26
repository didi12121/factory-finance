# Factory Finance — API 契约

> 状态：Phase 0.1。**本阶段仅 `GET /api/v1/health` 开放；其余业务 API 尚未实现，未认证请求一律返回 401。**
> 认证接口为**设计稿**（计划于 Phase 1 实现）。本文档与后端 `common.api` / `common.web` / `infrastructure.security` 实现保持一致。

## 1. 通用约定

| 项目 | 约定 |
| --- | --- |
| 路径规范 | `/api/v1/...`（版本化前缀，禁止绕过） |
| 请求/响应编码 | UTF-8；JSON（`application/json`） |
| 认证 | Bearer JWT（`Authorization: Bearer <token>`），**计划于 Phase 1**；当前所有业务接口默认 401 |
| 安全基线 | 无状态会话（`SessionCreationPolicy.STATELESS`）；CSRF 关闭（无状态 Token 模式）；禁用 HTTP Basic / 表单登录 |
| 公开端点 | `/api/v1/health`、`/actuator/health`、`/actuator/info`、OpenAPI 文档（仅非 docker 环境）、`OPTIONS` 预检 |
| CORS | 默认允许 `http://localhost:5173`（`app.cors.allowed-origins` 可配置）；暴露响应头 `X-Trace-Id` |
| 错误处理 | 语义一致的 HTTP 状态码；**不允许所有请求统一返回 HTTP 200** |

## 2. 统一响应模型

所有接口响应使用 `ApiResponse` 包装，字段为 `code` / `message` / `data` / `traceId`（实现：`com.factoryfinance.common.api.ApiResponse`）。

成功示例：

```json
{
  "code": "SUCCESS",
  "message": "success",
  "data": {},
  "traceId": "5f3a7c9e12b84d6fa0c1e2b3d4a5f607"
}
```

参数校验失败示例（HTTP 400）：

```json
{
  "code": "VALIDATION_ERROR",
  "message": "参数校验失败",
  "data": {
    "fieldErrors": {
      "page": "页码必须大于等于 1"
    }
  },
  "traceId": "9b8e2d1c3f4a4b5c8d7e6f0a1b2c3d4e"
}
```

约定：

- `code` 为字符串枚举（见第 3 节），`message` 为面向用户的中文说明，`data` 为业务载荷（错误时为 `null` 或错误详情），`traceId` 为本次请求的追踪 ID。
- 业务异常通过 `BusinessException` 抛出，由 `GlobalExceptionHandler` 转换为对应状态码与错误码。

## 3. 错误码表（`ErrorCode`，与 HTTP 状态映射）

| 错误码 | HTTP 状态 | 默认 message | 触发场景 |
| --- | --- | --- | --- |
| `SUCCESS` | 200 | success | 成功 |
| `BAD_REQUEST` | 400 | 请求参数不合法 | 请求体/参数格式错误（如 JSON 不可读、类型不匹配） |
| `VALIDATION_ERROR` | 400 | 参数校验失败 | Jakarta Validation 校验失败（`data.fieldErrors` 给出字段级错误） |
| `UNAUTHORIZED` | 401 | 未认证或凭证无效 | 未携带/无效/过期令牌 |
| `FORBIDDEN` | 403 | 无权访问 | 已认证但无权限 |
| `NOT_FOUND` | 404 | 资源不存在 | 路由或资源不存在 |
| `METHOD_NOT_ALLOWED` | 405 | 请求方法不允许 | HTTP 方法不受支持 |
| `CONFLICT` | 409 | 资源状态冲突 | 业务状态冲突（如重复单据编号、已过账凭证再修改） |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 | 未预期异常（不向客户端泄露堆栈） |

安全入口（认证失败/拒绝访问）同样输出上述统一模型，由 `SecurityConfig` 写出 `UNAUTHORIZED` / `FORBIDDEN` 响应体。

## 4. 分页模型

请求（`PageQuery`）：

| 参数 | 类型 | 约束 | 默认 |
| --- | --- | --- | --- |
| page | integer | ≥ 1 | 1 |
| size | integer | 1–500 | 20 |

响应（`PageResult`）：

```json
{
  "code": "SUCCESS",
  "message": "success",
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "size": 20
  },
  "traceId": "..."
}
```

- `items` 当前页数据；`total` 总条数；`page` 当前页码（从 1 开始）；`size` 每页条数。
- 超出约束的分页参数返回 `VALIDATION_ERROR`（400）。

## 5. 金额传输规范

- 金额一律以**十进制字符串**传输（如 `"1850.39"`、`"-1850.39"`），**禁止**使用 JSON number 承载财务金额（避免 JS Number 精度问题）。
- 服务端反序列化为 Java `BigDecimal`，数据库 `DECIMAL(18,2)`；高精度字段（单价、分摊等）单独定义精度。
- 禁止科学计数法；小数位超过字段精度时按对应业务规则的舍入方式处理（舍入规则待架构师确认）。
- 前端解析/运算使用 BigInt 定点实现（`frontend/src/utils/decimal.ts`），禁止 JS Number 财务运算。

## 6. Request ID / Trace ID

- 请求头 `X-Trace-Id` 可选透传：客户端携带则沿用，缺失则服务端生成（32 位十六进制 UUID）。
- 服务端始终在**响应头**回写 `X-Trace-Id`（CORS 已暴露该头），并在响应体 `traceId` 字段返回同一值。
- Trace ID 写入 SLF4J MDC（日志格式含 `[%X{traceId:-}]`），实现前后端问题定位串联（实现：`TraceIdFilter`）。

## 7. 健康检查（Phase 0.1 已实现）

`GET /api/v1/health` —— 允许匿名访问，用于部署与运维验证。

响应示例（HTTP 200）：

```json
{
  "code": "SUCCESS",
  "message": "success",
  "data": {
    "status": "UP",
    "service": "factory-finance",
    "time": "2026-11-26T14:48:27.123456Z"
  },
  "traceId": "a1b2c3d4e5f6478899aabbccddeeff00"
}
```

另有 Actuator `GET /actuator/health`（只暴露 `health,info` 端点，不展示细节），供 Docker 健康检查使用。

## 8. 认证接口设计（**计划于 Phase 1 实现，仅接口设计**）

当前实现状态：`modules/identity/api/AuthApi` 仅保留接口定义与 DTO，**未发布路由**；`JwtService` 提供 HS256 令牌签发/解析/验签基础设施。正式用户、角色、权限与 JWT 生命周期管理在 Phase 1 实现。禁止伪造 JWT 或默认放行业务接口。

### 8.1 登录

`POST /api/v1/auth/login`（设计稿）

请求体（`LoginRequest`）：

```json
{
  "username": "admin",
  "password": "********"
}
```

- `username`：必填，≤ 64 字符；`password`：必填，≤ 128 字符。
- 校验失败返回 `VALIDATION_ERROR`；用户名或密码错误返回 `UNAUTHORIZED`（401）。

成功响应（`TokenResponse`，HTTP 200）：

```json
{
  "code": "SUCCESS",
  "message": "success",
  "data": {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresAt": 1795700000
  },
  "traceId": "..."
}
```

- `expiresAt` 为 Epoch 秒；令牌 HS256 签名，`issuer=factory-finance`，默认有效期 2 小时（`JwtProperties`，可配置）。
- 后续请求携带 `Authorization: Bearer <accessToken>`。

### 8.2 后续（待架构师确认后细化）

- 令牌刷新、吊销、当前用户信息、修改密码等端点设计在 Phase 1 细化。

## 9. 业务 API 规划（均未实现）

资金账户/流水、客户/供应商、应收/收款/核销、应付/付款、费用、股东往来、固定资产、凭证、报表等 REST 资源统一遵循：`/api/v1/<resource>` + 本契约的响应/错误/分页/金额/Trace 规范。**当前这些接口均未实现且默认返回 401**；各阶段接口随业务实现逐步补充到本文档。
