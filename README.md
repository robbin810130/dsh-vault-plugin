# DSH Vault Plugin

DSH Web profile 的前台隐私锁插件：通过密码组、继承关系、自动锁定和恢复流程，控制 Workspace 与 Session 的前台访问。

> **安全边界（一期）**：插件只控制 DSH 前台访问，不加密原始 Workspace、Session 或项目源文件的持久化数据。落盘加密属于二期，不应把本插件当作磁盘加密或数据防泄漏产品。

## 一条命令安装

适用于 macOS / Linux。要求已安装 DSH，并且 `dsh` 在 `PATH` 中：

```bash
curl -fsSL https://raw.githubusercontent.com/robbin810130/dsh-vault-plugin/main/install.sh | bash
```

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/robbin810130/dsh-vault-plugin/main/install.ps1 | iex
```

安装器从 GitHub Releases 下载最新插件包和 SHA-256 校验文件，校验通过后调用 DSH 原生命令：

```text
dsh plugin --profile web add <downloaded-package>
```

安装完成后重启 DSH Web profile。安装器不会直接改写 DSH 配置，也不会上传密码、恢复密钥或 Vault 状态。

## 兼容性

- DSH：`v0.1.1-rc.2`
- Node.js：`^22.19.0 || >=24.0.0`（由插件包声明）
- 运行 profile：`web`

此版本依赖仓库内针对 DSH `v0.1.1-rc.2` 的兼容补丁。使用源码构建的 DSH，先按 [`compat/dsh-v0.1.1-rc.2/README.md`](compat/dsh-v0.1.1-rc.2/README.md) 应用补丁；未知 DSH 版本不得直接套用旧补丁。

## 首次使用

1. 在 DSH 设置中打开 Vault，创建密码组。
2. 创建时显示一次 recovery key；离线保存，插件不会再次显示或代为托管。
3. 按需把密码组绑定到 Workspace 或 Session。
4. 解锁只保存在当前运行时内，自动锁定按设置执行。

密码、recovery key 和 grant token 不应写入日志、配置文件、浏览器持久化存储或 issue。

## 升级、卸载与回滚

再次执行安装命令即可通过 DSH 原生命令升级：

```bash
curl -fsSL https://raw.githubusercontent.com/robbin810130/dsh-vault-plugin/main/install.sh | bash
```

卸载：

```bash
dsh plugin --profile web remove @robbin810130/dsh-vault-plugin
```

详细的本地打包、备份、回滚和紧急解除保护流程见 [`docs/install.md`](docs/install.md)。卸载不会删除原始 DSH Workspace/Session；回滚前不要擅自删除 Vault 状态目录。

## 开发与验证

```bash
pnpm --dir plugin install --frozen-lockfile
pnpm --dir plugin run build
pnpm --dir plugin exec vitest run
pnpm --dir plugin exec tsc -p tsconfig.host.json --noEmit
pnpm --dir plugin exec tsc -p tsconfig.client.json --noEmit
node scripts/package-release.mjs
node --test tests/install-script.test.mjs tests/scripts/package-release.test.mjs
```

发布资产由 GitHub Actions 在 `v*` 标签上生成：

- `dsh-vault-plugin.tgz`
- `dsh-vault-plugin.tgz.sha256`
- `dsh-vault-plugin-dsh-v0.1.1-rc.2.patch`

## 项目文档

- 设计规格：[`docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`](docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md)
- 安装与回滚：[`docs/install.md`](docs/install.md)
- 安全边界：[`docs/security-boundary.md`](docs/security-boundary.md)
- DSH 兼容补丁：[`compat/dsh-v0.1.1-rc.2/README.md`](compat/dsh-v0.1.1-rc.2/README.md)
