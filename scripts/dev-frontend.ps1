# Factory Finance — 本地启动前端（开发模式）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/dev-frontend.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Set-Location (Join-Path $root 'frontend')
Write-Host '启动 Factory Finance 前端 (http://localhost:5173，/api 代理到 8080) ...'
npm run dev
