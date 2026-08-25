# Task 3 Report: Atomic private-state repository

## 状态

完成。已按严格 TDD 实现后续 bindings/service/CLI 共用的原子私有状态仓库。

## 改动文件

- `plugin/src/host/state/model.ts`
- `plugin/src/host/state/schema.ts`
- `plugin/src/host/state/repository.ts`
- `plugin/tests/host/state-repository.spec.ts`

## RED 证据

先只创建测试文件，再运行：

```bash
rtk pnpm --dir=plugin vitest run tests/host/state-repository.spec.ts
```

结果：退出码 `1`，suite 在导入阶段失败，关键错误为：

```text
Cannot find module '../../src/host/state/repository.js'
```

失败原因是 production state repository 尚不存在，符合 brief 的预期 RED。

## GREEN / 验证

- 聚焦测试：`rtk pnpm --dir=plugin vitest run tests/host/state-repository.spec.ts`，1 个文件、9 个测试通过。
- plugin 全量测试：`rtk pnpm --dir=plugin test`，3 个文件、26 个测试通过。
- typecheck：`rtk pnpm --dir=plugin typecheck`，通过。
- build：`rtk pnpm --dir=plugin build`，通过，tsdown 成功生成 6 个构建文件。
- whitespace：`rtk git diff --check`，通过。

## 原子写顺序与失败语义

状态提交严格执行：

1. 创建并强制设置状态目录为 `0700`。
2. 在同目录以 `wx` 和 `0600` 创建唯一临时文件。
3. 写入完整 JSON，并对临时文件执行 `FileHandle.sync()`。
4. 当前 `state.json` 存在时复制为 `state.json.bak`，并强制设置为 `0600`。
5. 将临时文件 rename 为 `state.json`。
6. 打开状态目录并执行目录 `sync()`。
7. 仅在上述步骤全部成功后替换内存 snapshot/revision。

revision 不匹配返回 `{ ok: false, code: 'revision-conflict' }`，不触碰磁盘。写入、备份、rename 或 fsync 失败均拒绝提交；rename 前失败会清理临时文件并保留原状态与内存 revision。rename 后目录 fsync 失败时，磁盘持久性结果视为不确定，调用返回失败并使内存 snapshot 失效，后续操作必须从磁盘重新加载，不把未确认持久化的 next snapshot 当作成功提交。损坏 JSON、未知 schema 或结构非法均直接拒绝，不回退、不静默重置。

审计日志以 `0600` 追加 JSONL 并执行文件 `sync()`；password、recovery key、grant token 对应字段在任意嵌套层级写盘前统一替换为 `[REDACTED]`。

## 自审

- `VaultState`/`PasswordGroup` 直接复用 `SecretVerifier`，bindings 直接复用 `ProtectionBinding`，未复制前置类型。
- schema 仅接受版本 `1`，拒绝未知字段、非法 revision、非法 verifier 参数和非法 binding 枚举。
- load/commit/audit 操作在单实例内串行，避免并发 expectedRevision 检查同时通过。
- 首次 load 创建 revision 0 空状态；后续 commit 强制 revision 恰好加一。
- 返回和缓存的状态执行深冻结；commit 对输入先 clone、校验和规范化，调用方无法在持久化后篡改仓库 snapshot。
- 未增加依赖；production code 无 console/logger 输出，不记录 plaintext password、recovery key 或 grant token。
- 变更仅限 brief 指定实现、测试与本报告；未派发 subagent/reviewer。

## Commit

`feat(vault): persist private state atomically`（本报告随该提交提交）

## Concerns

- 无阻塞项。POSIX 下 rename 成功而目录 fsync 失败属于持久性结果不确定场景；实现按 fail-closed 返回失败并使内存 snapshot 失效，不尝试静默回滚或宣布成功。

---

## Fix Round 1 状态

完成。逐项修复 review 的 3 个 Critical、4 个 Important，以及与持久化安全直接相关的首次创建 audit 后目录 fsync；未处理其他非阻塞扩展。

## Fix Round 1 改动文件

- `plugin/src/host/state/model.ts`
- `plugin/src/host/state/schema.ts`
- `plugin/src/host/state/repository.ts`
- `plugin/tests/host/state-repository.spec.ts`
- `.superpowers/sdd/2026-08-24-02-dsh-vault-host/task-3-report.md`

## Fix Round 1 RED 证据

先只修改 `plugin/tests/host/state-repository.spec.ts`，再运行：

```bash
rtk pnpm --dir=plugin vitest run tests/host/state-repository.spec.ts
```

结果：退出码 `1`，共 `22` 个测试，其中 `15` 个失败、`7` 个通过。真实失败覆盖：

- 两个 repository 并发从 revision 0 提交时第二个仍返回成功。
- state rename 失败后首次 temp unlink 的瞬时失败被吞掉并残留 temp。
- temp 持续无法清理时只暴露原始 rename 错误，没有明确 cleanup fail-closed 错误。
- backup 仍直接覆盖 `.bak`，不存在 backup temp/sync/rename 和对应目录 sync 顺序。
- backup copy 中途失败会破坏旧 `.bak`。
- `state.json` 缺失但 `.bak` 存在时错误初始化空状态。
- load 不会把既有 `.bak` 权限收紧到 `0600`。
- 非 canonical base64、15-byte salt、31-byte verifier 均被接受。
- `passwordValue`、`recoveryKeyValue`、`grantTokenValue`、`value` 等未知审计字段会写盘。
- 首次创建 `audit.jsonl` 后没有目录 fsync。

关键 RED 输出：

```text
Test Files  1 failed (1)
Tests       15 failed | 7 passed (22)
```

## Fix Round 1 修复项

1. 新增同目录 `state.lock` 跨实例/进程互斥；`load()`/`commit()` 在锁内重新读取磁盘状态，CAS 不再依赖实例内 snapshot。并发 stale writer 得到 `revision-conflict`，锁超时明确 fail closed。
2. load 先检查并收紧 `.bak` 权限；`state.json` 缺失但 `.bak` 存在时拒绝初始化并要求显式恢复，不创建/覆盖状态文件。
3. `AuditEvent` 改为严格 readonly allowlist；运行时 `parseAuditEvent()` 拒绝未知字段，只输出时间、动作、稳定 ID、revision/credentialVersion/count、result/reasonCode。
4. backup 改为同目录 temp：独占创建、复制、`chmod 0600`、文件 sync、rename 为 `.bak`、目录 sync；仅备份完全持久后才替换主状态。
5. state/backup temp 清理最多重试 3 次；`ENOENT` 视为已清理，瞬时失败可恢复，持续失败以包含 cleanup 的 `AggregateError` 明确暴露。
6. verifier schema 校验 canonical base64 round-trip，并强制 salt 为 16 bytes、verifier 为 32 bytes；password/recovery 共用同一严格解析。
7. load 时既有 `.bak` 必须成功 `chmod 0600`，权限修复失败即拒绝加载。
8. `audit.jsonl` 使用 `ax` 判断首次创建，文件写入并 sync 成功后再 sync 状态目录。

## Fix Round 1 原子顺序与失败语义

commit 在获取 `state.lock` 后重新读取磁盘 revision，并严格执行：

1. 同目录 `wx` 创建 state temp，强制 `0600`。
2. 写完整候选 JSON，sync state temp。
3. 同目录 `wx` 创建 backup temp。
4. 当前 state 复制到 backup temp，强制 `0600`，重新打开并 sync。
5. rename backup temp → `state.json.bak`，sync 目录。
6. rename state temp → `state.json`，再次 sync 目录。
7. 成功释放跨进程锁后，才替换实例内 snapshot。

任何校验、写入、copy、chmod、sync、rename 或 lock cleanup 失败均返回/抛出失败；主状态 rename 前失败保留旧 state，backup temp 失败保留旧 `.bak`。敏感 temp 会重试清理，无法清理时不会吞错。主状态 rename 后目录 sync 失败仍按结果不确定处理：调用失败且内存 snapshot 不前移，后续操作重新读取磁盘。

## Fix Round 1 GREEN / 验证

- 聚焦测试：`rtk pnpm --dir=plugin vitest run tests/host/state-repository.spec.ts` → `1` file、`22/22` tests passed。
- plugin 全量测试：`rtk pnpm --dir=plugin test` → `3` files、`39/39` tests passed。
- typecheck：`rtk pnpm --dir=plugin typecheck` → exit `0`。
- build：`rtk pnpm --dir=plugin build` → exit `0`，tsdown 成功生成 6 个文件。
- whitespace：`rtk git diff --check` → exit `0`。

## Fix Round 1 自审

- Critical 1：锁内 disk revision CAS；并发双实例测试稳定得到一个成功、一个 conflict，不静默覆盖。
- Critical 2：missing state + existing backup 明确拒绝，测试确认 state 未创建且 backup 内容未变。
- Critical 3：编译期严格 `AuditEvent` + 运行时 exact-key allowlist；四个指定泄漏字段全部拒绝且 audit 文件不创建。
- Important 4：backup 的 copy/sync/rename 全部发生在独立 temp；注入 partial copy 失败后旧 `.bak` 可正常解析且内容不变。
- Important 5：瞬时 unlink 失败后重试成功且无 `.tmp-` 残留；持续失败返回明确 cleanup 错误。
- Important 6：canonical base64、16-byte salt、32-byte verifier 均有拒绝测试。
- Important 7：load 对既有 `.bak` 执行 `chmod 0600` 并有模式断言。
- audit 目录持久性：首次创建后 file sync → directory sync 顺序有测试。
- `SecretVerifier` 与 `ProtectionBinding` 继续直接复用前置接口；无复制漂移类型，无新依赖，无 plaintext secret 日志。
- 未派发 subagent/reviewer。

## Fix Round 1 Commit

`fix(vault): harden atomic state persistence`（本报告随该提交提交）

## Fix Round 1 Concerns

- 无阻塞项。进程异常退出遗留的 `state.lock` 不会被自动猜测为 stale 或删除；后续访问会超时并 fail closed，需要显式运维恢复，避免误删仍由活跃进程持有的锁。

---

## Fix Round 2 状态

完成。仅修复 scoped re-review 的 2 个 Important 和 1 个 Minor，并新增对应回归测试；未派发 subagent/reviewer。

## Fix Round 2 改动文件

- `plugin/src/host/state/repository.ts`
- `plugin/tests/host/state-repository.spec.ts`
- `.superpowers/sdd/2026-08-24-02-dsh-vault-host/task-3-report.md`

## Fix Round 2 RED 证据

先只修改 `plugin/tests/host/state-repository.spec.ts`，再运行：

```bash
rtk pnpm --dir=plugin vitest run tests/host/state-repository.spec.ts
```

结果：退出码 `1`。

```text
Test Files  1 failed (1)
Tests       5 failed | 20 passed (25)
```

真实失败覆盖：

- backup stage 成功后主 `state.json` rename 失败时，`.bak` 已被提前发布。
- 敏感 temp 持续清理失败后，FS 恢复时下一次 `load()` 不会扫描清除 stale temp。
- stale temp 仍无法清理时，下一次操作仍会读取/触碰正常 state。
- 原子调用顺序仍先发布 backup、后发布主 state。
- 首次 audit 创建后的 file sync 失败，第二次成功 append 走 `a` 分支时不会 sync directory。

## Fix Round 2 修复项

1. backup 继续在同目录 temp 完整 stage/sync，但主 state rename 成功并完成目录 sync 前不发布 `.bak`；主 rename 失败只清理两个 staging temp，旧 `.bak` 保持不变。若 state 已发布而 backup 发布前失败，则使用仍在 backup temp 中的提交前 state 回滚主 state，并同步目录。
2. `load()`、`commit()`、`appendAudit()` 均在取得跨实例锁后、任何正常状态读写前扫描仓库自己的 `.state.json.tmp-*` 与 `.state.json.bak.tmp-*` 命名空间；逐个执行三次 unlink 重试并同步目录。任一 stale temp 无法清理即明确拒绝操作，不读取、写入或 chmod 正常 state，也不吞 cleanup error。
3. audit 每次成功 append 并完成 file sync 后都执行 directory sync，不再依赖本次是否通过 `ax` 首次创建；因此首次写/sync 失败后，后续走 `a` 的成功追加仍会持久化目录项。

## Fix Round 2 原子顺序与失败语义

commit 在锁内先完成 stale temp 清扫，再按以下顺序执行：

1. `wx` 创建 state temp，写完整 JSON，sync 文件。
2. `wx` 创建 backup temp，将提交前 state 复制到其中，强制 `0600`，sync 文件。
3. rename state temp → `state.json`，sync 目录。
4. rename backup temp → `state.json.bak`，再次 sync 目录。
5. 全部成功并释放锁后才更新实例内 snapshot。

因此 backup staging、copy 或主 state rename 失败时，旧 state 与旧 `.bak` 均不变；主 state 已发布但 backup 尚未发布的后续失败会尝试用 backup temp 回滚。temp 清理或回滚失败均以明确的 fail-closed 聚合错误暴露，并由下一次锁内操作在业务读写前重新清扫。

## Fix Round 2 GREEN / 验证

- 聚焦测试：`rtk pnpm --dir=plugin vitest run tests/host/state-repository.spec.ts` → exit `0`，`1` file、`25/25` tests passed。
- plugin 全量测试：`rtk pnpm --dir=plugin test` → exit `0`，`3` files、`42/42` tests passed。
- typecheck：`rtk pnpm --dir=plugin typecheck` → exit `0`，`tsc -p tsconfig.host.json --noEmit`。
- build：`rtk pnpm --dir=plugin build` → exit `0`，tsdown 成功生成 `6` 个文件。
- whitespace：`rtk git diff --check` → exit `0`。

## Fix Round 2 自审

- Finding 1：测试直接构造已有 revision 1 state 与 revision 0 backup，注入主 state rename 失败；断言提交失败后两者内容均保持不变且无 temp 残留。成功路径继续断言 `.bak` 精确等于提交前 state。
- Finding 2：测试覆盖持续 unlink 失败留下敏感 temp、FS 恢复后下一次 `load()` 清扫成功；另一个测试断言清扫持续失败时正常 state 的 chmod/read 次数均为零。三类公开操作共用同一锁内前置清扫路径。
- Finding 3：测试覆盖首次 `ax` 写入后 audit file sync 失败、下一次 `a` 成功追加，并断言成功调用执行一次 directory sync。
- temp 扫描仅匹配仓库生成的两个固定前缀，不删除无关文件；清扫发生在跨实例锁内。
- 未改变 schema/contracts，无新依赖，无 plaintext secret 日志，无本轮范围外扩展。

## Fix Round 2 Commit

`fix(vault): recover interrupted persistence`（本报告随该提交提交）

## Fix Round 2 Concerns

- 无阻塞项。若底层文件系统持续拒绝删除 stale temp，仓库会按要求保持 fail closed，直至权限或文件系统故障恢复。
