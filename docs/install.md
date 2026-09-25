# DSH Vault 安装、升级与回滚

当前目标：DSH 0.1.7-rc.1，Vault 0.2.10。该 DSH 版本需要安装本版本随附的精确宿主补丁和客户端 bundle；重装 Vault 插件本身不会更新 DSH 全局 bundle。旧 scoped 包必须先停服迁移，见仓库 README；不要同时加载新旧包。

## 1. 生成并校验发布包

    node scripts/package-release.mjs
    node --test tests/scripts/package-release.test.mjs
    shasum -a 256 artifacts/dsh-vault-plugin.tgz

脚本会先构建 plugin，再生成以下固定资产：

- `artifacts/dsh-vault-plugin.tgz`
- `artifacts/dsh-vault-plugin.tgz.sha256`

## 2. 安装到 DSH Web profile

在已安装 DSH 0.1.7-rc.1 的机器上执行：

    dsh plugin --profile web add github:robbin810130/dsh-vault-plugin#v0.2.10
    dsh web --dump-config

确认配置中只有一份 Vault 插件和对应的 cordis patch。停服并备份 web profile 与 Vault 状态后，将 GitHub Release 中 `dsh-vault-client-bundles-dsh-v0.1.7-rc.1.tgz` 内的四个 `lib/client.js` 部署到对应的 DSH 全局包，再通过正常启动器重启并验证 Workspace 行锁按钮。

## 3. 首次使用

- 插件安装后不会自动锁定已有 Workspace 或 Session。
- 在设置中创建密码组，并按需绑定 Workspace/Session。
- 创建密码组时仅当场显示一次 recovery key；请离线保存。
- 调试或恢复时不得把密码、recovery key、grant token 写入日志、配置或浏览器持久化存储。

## 4. 升级与回滚

升级前备份 Host 状态目录（默认 $DSH_HOME/vault-lock）：

    cp -a "$DSH_HOME/vault-lock" "$DSH_HOME/vault-lock.backup-$(date +%Y%m%d-%H%M%S)"

若使用源码安装的 DSH，先应用仓库内针对 0.1.7-rc.1 固定版本的补丁；回滚时恢复补丁前源码/构建产物，再移除插件：

    dsh plugin --profile web remove dsh-vault-plugin

回滚前不要删除 vault-lock，除非已确认不再需要恢复密码组。插件卸载后，DSH 原始 Workspace/Session 仍按原生方式可用。

## 5. 紧急解除保护

仅在确认 group id 后执行：

    dsh plugin --profile web exec dsh-vault protection remove --group <full-group-id>

该命令只解除指定密码组的保护关系，不删除原始 DSH 数据。
