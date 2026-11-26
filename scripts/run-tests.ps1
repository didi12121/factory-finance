# Factory Finance — 运行全部测试
# 后端单元测试 + 集成测试（需要 Docker）、前端 Vitest、Playwright 端到端与截图
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$env:JAVA_HOME = 'C:\Users\陈\.jdks\dragonwell-ex-21.0.10'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$mvn = 'C:\Program Files\JetBrains\IntelliJ IDEA 2025.3.1\plugins\maven\lib\maven3\bin\mvn.cmd'

Write-Host '== 后端 mvn verify（含 Testcontainers 集成测试） =='
& $mvn -f (Join-Path $root 'backend\pom.xml') verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '== 前端 npm test（Vitest） =='
Set-Location (Join-Path $root 'frontend')
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '== Playwright 端到端测试与截图 =='
npm run test:e2e
