# Factory Finance — 本地启动后端（开发模式，Windows PowerShell）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/dev-backend.ps1
# 依赖：JDK 21（JAVA_HOME 或 PATH 中可找到 java）；Maven Wrapper 自带（无需全局安装 Maven）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# 优先使用已有 JAVA_HOME；未设置时给出明确指引（不硬编码开发机路径）
if (-not $env:JAVA_HOME) {
    $java = Get-Command java -ErrorAction SilentlyContinue
    if (-not $java) {
        Write-Error '未检测到 JDK 21：请设置 JAVA_HOME 或将 JDK 21 的 bin 目录加入 PATH。'
        exit 1
    }
    Write-Host "使用 PATH 中的 java: $($java.Source)"
} else {
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}

$mvnw = Join-Path $root 'backend\mvnw.cmd'
Write-Host '启动 Factory Finance 后端 (http://localhost:8080) ...'
& $mvnw -f (Join-Path $root 'backend\pom.xml') spring-boot:run
