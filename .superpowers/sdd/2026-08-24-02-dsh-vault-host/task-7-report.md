# Host Task 7 实施报告

## 交付

- 实现 dsh-vault Settings namespace，仅暴露非敏感 VaultPolicy 字段。
- 默认值复用 VaultPolicySchema，通过真实 installSettingsSection() 接入 Cordis，并支持 live onChange。
- VaultService 支持实时替换 policy，并同步 failed-attempt protection 配置。
- Host 与 CLI 共用 `~/.dsh/vault-lock` state directory resolution，并支持显式 absolute Config.stateDir。
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

## Fix Round 1（基于 f9396d5）

范围严格限定为 1 Critical + 3 Important：

- Critical：`isCliEntrypoint()` 改为通过 `node:fs.realpathSync` 比较模块路径与 `process.argv[1]`，同时保留不可解析路径的绝对路径回退；真实 `.bin/dsh-vault` symlink spawn 已验证不再静默退出。
- Important：Host/CLI 共用 `resolveStateDirectory()`；默认固定为 `os.homedir()/.dsh/vault-lock`，支持 `DSH_VAULT_STATE_DIR` 与 CLI `--state-dir`，显式路径优先且相对路径 fail closed；README 已补充一致性约束。
- Important：新增 repository `commitWithAudit()` 原子协议。预提交只写 sanitized `protection-removal-attempt`；revision conflict 只保留 attempt，不写虚假 success；审计预提交失败不触碰 state；成功写入可追溯 sanitized success event，success audit 故障触发状态回滚。无原子协议的外部 repository 不执行不安全 commit。
- Important：VaultService 每次 Host request/snapshot 前 reload repository；仅接受不低于缓存 revision 的快照，外部 revision 变化立即清除 grants，刷新失败由 API fail closed。

### Fix Round TDD

- RED：先加入默认 stateDir/env/相对路径、真实 symlink spawn、audit fault/conflict、CLI flag precedence、Host external revision/refresh failure 回归；生产修复前 focused suite 真实失败。
- GREEN：`tests/config.spec.ts`、`tests/cli.spec.ts`、`tests/host/service.spec.ts` focused suite：3 files / 40 tests passed。

### Fix Round 验证

- 完整 suite：12 files / 124 tests passed。
- Typecheck：`pnpm -C plugin exec tsc -p tsconfig.host.json --noEmit` 通过。
- Build：`pnpm -C plugin build` 通过，`lib/cli.js` executable。
- Pack dry-run：通过，包含 `lib/index.js`、`lib/cli.js`、declarations、`cordis.patch.yml`、README、LICENSE；无 `tests/`、`src/`。
- 实际 tarball：`artifacts/robbin810130-dsh-vault-plugin-0.1.0.tgz`。
- `git diff --check`：通过。
- 未安装用户 DSH；当前环境没有 `dsh` executable，因此未执行用户 DSH wrapper 命令。

## Fix Round 2（基于 5575081）

- Host/CLI state resolver 的 canonical priority 固化为：explicit Host `Config.stateDir` 或 CLI `--state-dir`、`DSH_VAULT_STATE_DIR`、`DSH_HOME/vault-lock`、`~/.dsh/vault-lock`；所有已提供路径即使被高优先级值遮蔽也必须为绝对路径。
- `commitWithAudit()` 的 audit append 对 partial write、file sync 与 directory sync 失败回滚到精确原始字节；success audit 失败时恢复 `state.json` 与 `state.json.bak` 的精确 durable 内容，恢复自身失败返回 `AggregateError` 并 fail closed。
- Host external refresh 统一校验：higher revision 正常接收并撤销 grants；same revision 内容漂移与 lower revision 均撤销 grants 并 fail closed；revision-conflict reload 复用同一 reconcile/validation 路径；load failure 继续 fail closed。
- README 已记录 canonical directory 规则。

### Fix Round 2 TDD 与验证

- RED：先新增 same-revision 内容漂移、lower revision、revision-conflict reload 三个 Host 回归；生产实现前 `tests/host/service.spec.ts` 以对应三个断言失败。
- GREEN focused：`tests/config.spec.ts`、`tests/cli.spec.ts`、`tests/host/state-repository.spec.ts`、`tests/host/service.spec.ts`、`tests/host/settings.spec.ts` 共 80 tests passed。
- Full：12 files / 135 tests passed。
- Typecheck：`tsc -p tsconfig.host.json --noEmit` 通过。
- Build：`tsdown` 通过，`lib/cli.js` 可执行。
- Pack dry-run：只包含发布所需 `lib`、`cordis.patch.yml`、`LICENSE`、`package.json`、`README.md`，不含 `src` 或 `tests`。
