#!/usr/bin/env bash
# Factory Finance — 本地启动后端（开发模式，Linux / macOS）
# 用法：./scripts/dev-backend.sh
# 依赖：JDK 21（JAVA_HOME 或 PATH 中可找到 java）；Maven Wrapper 自带
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${JAVA_HOME:-}" ] && ! command -v java >/dev/null 2>&1; then
  echo "未检测到 JDK 21：请设置 JAVA_HOME 或将 JDK 21 的 bin 目录加入 PATH。" >&2
  exit 1
fi

echo "启动 Factory Finance 后端 (http://localhost:8080) ..."
exec "$ROOT/backend/mvnw" -f "$ROOT/backend/pom.xml" spring-boot:run
