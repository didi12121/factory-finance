# 本地 Java 与前端开发环境

检查日期：2026-11-26。以下基于本机工具和本地项目配置整理；尚未验证项目完整构建或启动。

## 开发工具与运行环境

| 类别 | 本地版本或位置 | 验证情况 |
| --- | --- | --- |
| JDK 8 | Dragonwell 8，`D:\env\java`；另有 `C:\Users\陈\.jdks\dragonwell-1.8.0_482` | `D:\env\java` 下 Java 可执行 |
| JDK 11 | Dragonwell 11.0.29，`C:\Users\陈\.jdks\dragonwell-11.0.29` | Java 可执行 |
| JDK 21 | Dragonwell 21.0.10，`C:\Users\陈\.jdks\dragonwell-ex-21.0.10` | Java 可执行，可用于配置为 Java 17 的项目 |
| Maven | IDEA 自带：`C:\Program Files\JetBrains\IntelliJ IDEA 2025.3.1\plugins\maven\lib\maven3\bin\mvn.cmd`；另有 `D:\env\maven\settings.xml` 和本地仓库 | 未加入当前 PATH，尚未验证构建 |
| Node.js | 24.14.0 | 当前终端可运行 |
| npm | 11.9.0 | 当前终端可运行 |
| pnpm | 11.25.0 | 当前终端可运行 |
| IntelliJ IDEA | 2025.3.1 | 已安装 |
| VS Code | 1.127.0 | 当前终端可启动 |
| PhpStorm | 2026.1.4 | 已安装 |
| Git | 2.45.1 | 当前终端可运行 |
| Docker CLI | 29.4.3 | 命令可运行；未验证 Docker 服务 |

## 本地项目配置

| 项目 | Java 后端配置 | 前端配置 | 前端依赖情况 |
| --- | --- | --- | --- |
| `D:\env\erp_s` | Java 17、Spring Boot 4.1.0 | Vue 3.5.26、Vite 6.4.1 | `ruoyi-ui` 存在 `node_modules` 和 npm lock 文件 |
| `D:\env\ruoyi_new` | Java 17、Spring Boot 3.5.16 | Vue 3.5.26、Vite 6.4.1 | `frontend` 存在 `node_modules` 和 npm lock 文件 |
| `D:\env\ruoyi_rebuid` | Java 17、Spring Boot 4.1.0 | Vue 3.5.26、Vite 6.4.1 | `front` 未发现 `node_modules` 或 lock 文件 |

`C:\Users\陈\IdeaProjects` 下还发现 `ruoyi`、`OCR`、`moneyBot`、`binance_bot` 等 Maven 项目，以及一个使用 Gradle Wrapper 的 Android 示例。

## 当前终端的 Java 配置

检查时，`JAVA_HOME` 指向的路径多了一层 `dragonwell-1.8.0_482`，当前 PATH 中也没有 `java` 和 `javac`。开发上述 Java 17 项目时，可在当前 PowerShell 会话临时使用 JDK 21：

```powershell
$env:JAVA_HOME = 'C:\Users\陈\.jdks\dragonwell-ex-21.0.10'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
javac -version
```

此修改仅作用于当前 PowerShell 会话。Maven 可在 IDEA 中使用，或通过上表中的完整路径调用；使用 `D:\env\maven\settings.xml` 前应按项目需要检查其配置。

## 前端启动

已有依赖目录的项目可尝试在各自前端目录运行：

```powershell
npm run dev
```

Node 24 与具体依赖的兼容性、现有依赖完整性及项目运行所需的数据库、Redis 等服务，仍需实际启动确认。
