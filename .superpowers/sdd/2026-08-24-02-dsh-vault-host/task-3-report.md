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
