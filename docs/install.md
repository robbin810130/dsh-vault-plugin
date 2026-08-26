# DSH Vault 安装、升级与回滚

目标 DSH 版本：0.1.1-rc.2。

## 1. 生成并校验发布包

    node scripts/package-release.mjs
    node --test tests/scripts/package-release.test.mjs
    shasum -a 256 artifacts/dsh-vault-plugin-0.1.0.tgz

脚本会先构建 plugin，再生成 artifacts/dsh-vault-plugin-0.1.0.tgz。

## 2. 安装到 DSH Web profile

在已安装 DSH 0.1.1-rc.2 的机器上执行：

    dsh plugin --profile web add ./artifacts/dsh-vault-plugin-0.1.0.tgz
    dsh web --dump-config

确认配置中包含插件及 cordis.patch.yml 对应的兼容层，然后重启 DSH Web。

## 3. 首次使用

- 插件安装后不会自动锁定已有 Workspace 或 Session。
- 在设置中创建密码组，并按需绑定 Workspace/Session。
- 创建密码组时仅当场显示一次 recovery key；请离线保存。
- 调试或恢复时不得把密码、recovery key、grant token 写入日志、配置或浏览器持久化存储。

## 4. 升级与回滚

升级前备份 Host 状态目录（默认 $DSH_HOME/vault-lock）：

    cp -a "$DSH_HOME/vault-lock" "$DSH_HOME/vault-lock.backup-$(date +%Y%m%d-%H%M%S)"

若使用源码安装的 DSH，先应用仓库内针对 0.1.1-rc.2 固定版本的补丁；回滚时恢复补丁前源码/构建产物，再移除插件：

    dsh plugin --profile web remove @robbin810130/dsh-vault-plugin

回滚前不要删除 vault-lock，除非已确认不再需要恢复密码组。插件卸载后，DSH 原始 Workspace/Session 仍按原生方式可用。

## 5. 紧急解除保护

仅在确认 group id 后执行：

    dsh plugin --profile web exec dsh-vault protection remove --group <full-group-id>

该命令只解除指定密码组的保护关系，不删除原始 DSH 数据。
