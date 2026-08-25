# Task 2 Fix Round 1 Report: Ignore stale refresh responses

## 状态

完成。仅修复 `VaultClientStore.refresh()` 的并发响应竞态；未进入 Task 3，未修改 `artifacts/`。

## 根因

`refresh()` 原先没有请求代次或状态提交所有权。两个 refresh 重叠时，较新的请求可以先提交 revision 2，但较旧的 revision 1 响应随后仍会进入 `#acceptSnapshot()`。revision 回退被拒绝后，`#invalidResponse()` 又把当前 revision 2 snapshot 标记为 offline。

同一缺口也存在于 refresh 发起的 grant validation：旧 validation 在新 refresh 提交后返回时，仍可能删除 proof、发布旧的 unlocked 结果，或因失败触发 offline。

## RED

先在 `plugin/tests/client/store.client.spec.ts` 增加并发回归覆盖，再运行：

```bash
pnpm --dir plugin exec vitest run tests/client/api.client.spec.ts tests/client/store.client.spec.ts
```

结果：退出码 `1`，共 `4` 个预期失败：

- stale snapshot success：较新的 revision 2 ready 被改成 offline。
- stale snapshot failure：较新的 revision 2 ready 被改成 offline。
- stale validation invalid result：当前 tab 的 `group-a` proof 被删除。
- stale validation failure：较新的 revision 3 ready 被改成 offline。

## 最小修复

- 为每次 `refresh()` 分配单调递增的 `refreshGeneration`。
- snapshot 请求返回后，只有当前 generation 可以接受 snapshot 或触发 offline；过期成功返回当前公开 snapshot，过期失败原样返回净化后的失败结果，但均不提交状态。
- refresh 内部 validation 在开始、每个异步结果返回后及最终 publish 前检查 generation。过期 validation 不删除 proof、不发布 unlocked 状态、不触发 offline。
- 公共 `validateGrants()` 不携带 generation，保留原有独立调用语义；最新 refresh 的 fail-closed 行为不变。
- 未重构其他动作或 API。

## GREEN / 验证

| 门禁 | 结果 |
| --- | --- |
| focused API/store tests | 2 files / 15 tests passed |
| full test suite | 15 files / 189 tests passed |
| Client typecheck | exit 0 |
| Host typecheck | exit 0 |
| build | exit 0 |
| `git diff --check` | exit 0 |

## 改动文件

- `plugin/src/client/store.ts`
- `plugin/tests/client/store.client.spec.ts`
- `.superpowers/sdd/2026-08-24-03-dsh-vault-client-integration/task-2-fix-1-report.md`

## 边界

- 未触碰既有未跟踪 `artifacts/`。
- 未进入 Task 3。
- 未 merge、push 或 publish。
