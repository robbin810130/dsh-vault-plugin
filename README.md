# DSH Vault Plugin

DSH Web profile 的隐私锁：在侧边栏直接锁定 Workspace 或 Session，自动创建并绑定密码组，并在主区域通过密码解锁受保护内容。

这是社区插件，不隶属于 DeepSeek AI 或 DeepSeek Harness 官方团队。

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

也可以直接使用 DSH 原生安装命令安装 GitHub 仓库：

```bash
dsh plugin --profile web add github:robbin810130/dsh-vault-plugin#v0.2.2
```

## 功能概览

- 在 Workspace 或 Session 行内点击锁按钮即可上锁；首次上锁时输入密码，插件会自动创建密码组并完成绑定。
- Workspace 锁定后立即收起会话列表；已保护的会话名称显示为“已加密对话”，不会把原始标题泄露到侧边栏或无障碍文本。
- 解锁只从主区域的“解锁”按钮发起，不因点击列表条目自动弹出密码框；解锁状态仅保留在当前运行时。
- 支持自动锁定、系统休眠上锁、失败尝试保护与暂停时间。
- 密码策略可配置最小长度，以及大写、小写、数字和符号要求；创建和修改密码都会按当前策略校验。
- 创建或恢复成功时只显示一次恢复密钥；恢复密钥不会写入设置、日志或浏览器存储。
- 工作区重新上锁会立即使当前会话失效，避免继续浏览已打开的受保护内容。

## 使用流程

1. 在侧边栏找到 Workspace 或 Session，点击行内锁按钮。
2. 输入并确认密码，点击“保存并上锁”。密码组会自动生成并绑定，无需先到设置页手动创建。
3. 之后点击受保护条目可查看锁定占位页；需要访问时，在主区域点击“解锁”并输入密码。
4. 在设置 → 插件 → 保险箱中调整锁定策略或管理已经自动生成的密码组。

## 兼容性

- DSH：`v0.1.1-rc.2`
- Node.js：`^22.19.0 || >=24.0.0`（由插件包声明）
- 运行 profile：`web`

此版本依赖仓库内针对 DSH `v0.1.1-rc.2` 的兼容补丁。使用源码构建的 DSH，先按 [`compat/dsh-v0.1.1-rc.2/README.md`](compat/dsh-v0.1.1-rc.2/README.md) 应用补丁；未知 DSH 版本不得直接套用旧补丁。

## 权限、隐私与风险边界

- 插件会读取并写入本机 Vault 私有状态目录（默认 `~/.dsh/dsh-vault/`，或 `$XDG_STATE_HOME/dsh-vault/`），用于保存加密后的密码组元数据和锁定关系。
- 插件会注入 DSH Web profile 的设置、Workspace、Session 和主内容区域 UI，以提供锁定/解锁交互。
- 不依赖外部服务，不主动联网，不上传密码、恢复密钥或会话内容。
- 当前版本保护的是 DSH 前台访问；不会加密原始 Workspace、Session 或项目源文件。不要把它当作磁盘加密或数据防泄漏产品。
- 兼容范围见下节；未知 DSH 版本不要直接套用兼容补丁。

密码、恢复密钥和 grant token 不应写入日志、配置文件、浏览器持久化存储或 issue。

### 威胁模型与安全边界说明

本节明确当前版本**防什么、不防什么**，以及三个有意为之的设计权衡：

- **防的是谁**：防的是"借用你这台机器、打开 DSH 网页的人"（同事、家人、维修场景下的旁观者）。密码组密码经 PBKDF2 派生密钥后加密存储，连续输错触发组级冷却。
- **不防的是谁**：不防"已经能用你的系统账户执行代码的人"。本机同用户进程本来就能读取 Vault 状态文件（0600 权限只隔离其他系统用户），也能直接打开未加密的 Workspace/Session 源文件。这是 UI 层访问门禁，不是内容加密。
- **快照接口刻意不做认证**：锁 UI 在渲染前必须知道"哪些 session/workspace 受保护"，因此快照只暴露组 ID、成员数和绑定拓扑，绝不包含密码、密钥、会话内容或原始名称（受锁定的条目名称按策略替换为占位符）。同一系统用户本就能读到 state.json，隐藏这些元数据并不能提升安全性，只会让锁定提示无法正常显示。
- **限流计数是内存态**：输错计数随 DSH 重启清零。持久化计数会让状态文件在每次尝试时都落盘（放大损坏与泄露面），而重启 DSH 本身就是需要物理或账户权限的操作，与威胁模型匹配。组级冷却保证攻击者轮换客户端标识无法绕过。

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

发布前可用以下最小流程复现核心功能：创建一个测试会话 → 点击行内锁按钮 → 设置密码 → 确认侧边栏显示保护状态 → 在主区域点击“解锁” → 输入密码恢复访问。

发布资产由 GitHub Actions 在 `v*` 标签上生成：

- `dsh-vault-plugin.tgz`
- `dsh-vault-plugin.tgz.sha256`
- `dsh-vault-plugin-dsh-v0.1.1-rc.2.patch`

## 项目文档

- 设计规格：[`docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`](docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md)
- 安装与回滚：[`docs/install.md`](docs/install.md)
- 安全边界：[`docs/security-boundary.md`](docs/security-boundary.md)
- DSH 兼容补丁：[`compat/dsh-v0.1.1-rc.2/README.md`](compat/dsh-v0.1.1-rc.2/README.md)
