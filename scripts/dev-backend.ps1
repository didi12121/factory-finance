# Factory Finance — 本地启动后端（开发模式）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/dev-backend.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$env:JAVA_HOME = 'C:\Users\陈\.jdks\dragonwell-ex-21.0.10'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$mvn = 'C:\Program Files\JetBrains\IntelliJ IDEA 2025.3.1\plugins\maven\lib\maven3\bin\mvn.cmd'

Write-Host '启动 Factory Finance 后端 (http://localhost:8080) ...'
& $mvn -f (Join-Path $root 'backend\pom.xml') spring-boot:run
