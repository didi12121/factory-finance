# Factory Finance — 运行全部测试（Windows PowerShell）
# 后端单元测试 + 集成测试（需要 Docker）、前端 Vitest、Playwright 端到端与截图
# 用法：powershell -ExecutionPolicy Bypass -File scripts/run-tests.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if ($env:JAVA_HOME) {
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
} elseif (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Error '未检测到 JDK 21：请设置 JAVA_HOME 或将 JDK 21 的 bin 目录加入 PATH。'
    exit 1
}

$mvnw = Join-Path $root 'backend\mvnw.cmd'

Write-Host '== 后端 mvn verify（含 Testcontainers 集成测试，需要 Docker） =='
& $mvnw -f (Join-Path $root 'backend\pom.xml') verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '== 前端 npm test（Vitest） =='
Set-Location (Join-Path $root 'frontend')
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '== Playwright 端到端测试与截图 =='
npm run test:e2e
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '== Playwright 生产构建防护测试 =='
npm run test:e2e:prod
