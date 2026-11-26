#!/usr/bin/env bash
# Factory Finance — 运行全部测试（Linux / macOS）
# 后端单元测试 + 集成测试（需要 Docker）、前端 Vitest、Playwright 端到端与截图
# 用法：./scripts/run-tests.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${JAVA_HOME:-}" ] && ! command -v java >/dev/null 2>&1; then
  echo "未检测到 JDK 21：请设置 JAVA_HOME 或将 JDK 21 的 bin 目录加入 PATH。" >&2
  exit 1
fi

echo "== 后端 mvn verify（含 Testcontainers 集成测试，需要 Docker） =="
"$ROOT/backend/mvnw" -f "$ROOT/backend/pom.xml" verify

echo "== 前端 npm test（Vitest） =="
cd "$ROOT/frontend"
npm test

echo "== Playwright 端到端测试与截图 =="
npm run test:e2e

echo "== Playwright 生产构建防护测试 =="
npm run test:e2e:prod
