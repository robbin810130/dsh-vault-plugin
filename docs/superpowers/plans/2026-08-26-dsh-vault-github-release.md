# DSH Vault 一键安装发布 Implementation Plan

Goal: 将 DSH Vault 发布为可由一条命令安装到 DSH Web profile 的 GitHub Release 插件。

Architecture: GitHub Actions 在版本标签上构建并生成固定命名的 tgz、SHA-256 和 DSH 兼容补丁资产；macOS/Linux 使用 install.sh，Windows 使用 install.ps1。安装器只下载 Release 资产并调用 DSH 原生 plugin --profile web add，不直接改写 DSH 配置。

1. 定义固定 Release 资产并补充打包测试。
2. 实现 macOS/Linux 与 Windows 一键安装器，并补静态契约测试。
3. 添加 CI 与 GitHub Release workflow，完善社区 README、升级、卸载和安全边界说明。
4. 串行执行全量验证，检查工作树后推送分支和 v0.1.0 标签。
