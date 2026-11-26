#!/usr/bin/env bash
# Factory Finance — 本地启动前端（开发模式，Linux / macOS）
# 用法：./scripts/dev-frontend.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/frontend"
echo "启动 Factory Finance 前端 (http://localhost:5173，/api 代理到 8080) ..."
npm run dev
