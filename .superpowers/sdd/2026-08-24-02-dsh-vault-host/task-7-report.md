# Host Task 7 实施报告

## 交付

- 实现 dsh-vault Settings namespace，仅暴露非敏感 VaultPolicy 字段。
- 默认值复用 VaultPolicySchema，通过真实 installSettingsSection() 接入 Cordis，并支持 live onChange。
- VaultService 支持实时替换 policy，并同步 failed-attempt protection 配置。
- Host 与 CLI 共用 DSH_HOME/vault-lock state directory resolution。
- 新增 dsh-vault CLI binary，支持：
  dsh plugin --profile web exec dsh-vault protection remove --group <full-group-id>。
- CLI 展示 group name/member count，要求输入完整 group id 二次确认；仅删除目标组的 protection bindings，保留 direct Session 等无关 binding。
- 使用 revision-checked commit，并写入 allowlisted sanitized audit；失败统一 fail closed，不输出 verifier/password/recovery/token/path/stack。
- package.json 增加正确 bin，并补齐最小 README.md、LICENSE。

## TDD 证据

- RED：settings/CLI 模块尚不存在时，新增 focused specs 失败。
- GREEN：实现后 focused specs 与完整 Host suite 均通过。

## 验证

- Focused：2 files / 6 tests passed
- 完整 Host：12 files / 115 tests passed
- Typecheck：pnpm -C plugin exec tsc -p tsconfig.host.json --noEmit 通过
- Build：pnpm -C plugin build 通过，lib/cli.js 获得 executable permission
- Pack dry-run：通过
- 实际 tarball：artifacts/robbin810130-dsh-vault-plugin-0.1.0.tgz
- Tarball 审计：包含 lib/index.js、lib/cli.js、declarations、cordis.patch.yml、README.md、LICENSE；不含 tests/、src/ 或测试 secret literals；CLI executable。
- Built CLI 无状态错误路径：exit code 2，仅输出 Vault operation failed.
- 真实 SettingsProvider + Cordis Context：验证 autoLockMinutes live 更新到 service。
- 当前环境未安装 dsh executable，因此未执行用户 DSH invocation；未安装到用户 DSH。

## 边界

- 未 merge、push、publish。
- 未修改 rtk-token-keeper。
- 未派生 subagent/reviewer。
