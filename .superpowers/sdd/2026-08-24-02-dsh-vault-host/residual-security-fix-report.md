# DSH Vault Host Residual Security Fix Report

## 状态与范围

- 基线：`cc1cc22 fix(vault): enforce host authorization boundaries`。
- 仅修复 `final-scoped-re-review.md` 证明的 session `workspaceId` 授权绕过。
- 修改范围仅含 Host service、Host service 回归测试与本报告；未修改 Client、`plugin/package.json` 或 `./client` export。

## 根因裁定

Host 没有可信的 session-to-workspace resolver。旧实现把请求 binding 中可选且由 caller 提供的 `workspaceId` 用作 session mutation 授权范围的依据。攻击者省略该字段或伪造为未受保护 Workspace 时，旧/新 protection 都会被解析为未保护，`affectedGroups` 为空，因此无 grant 请求被放行。

## TDD 证据

### RED

仅修改 `plugin/tests/host/service.spec.ts`，为 `bindings-update` 与 `group-create` 分别加入缺失/伪造 `workspaceId` 的无 grant 攻击回归。每条回归都要求：

- 请求返回 `invalid-credentials`；
- snapshot/state 不变；
- audit 文件字节不变；
- 攻击前已有有效 grant 仍然有效。

命令：

```bash
rtk pnpm --dir plugin test -- tests/host/service.spec.ts
```

结果：exit 1；12 files 中 1 failed，170 tests 中恰好 4 failed / 166 passed。失败项正是：

- `bindings-update` + missing `workspaceId`；
- `bindings-update` + forged `workspaceId`；
- `group-create` + missing `workspaceId`；
- `group-create` + forged `workspaceId`。

四条攻击在旧实现中均错误返回成功并把 revision 从 2 推进到 3，证明测试命中 reviewer 指定漏洞。

### GREEN

第一次最小实现将 `inherit` 与 `absent` 合并为同一类，focused 测试保留 1 个既有失败：移除 inherit binding 后旧 Workspace grant 未撤销。根据既有语义与裁定，随后改为精确四态比较：`direct`、`inherit`、`no-inherit`、`absent`。

最终 focused 命令：

```bash
rtk pnpm --dir plugin exec vitest run tests/host/service.spec.ts
```

结果：exit 0；1 file / 41 tests 全部通过。

## 最小生产修复

- session mutation 不再使用 caller `workspaceId` 决定授权组。
- old/new session direct binding 的显式密码组始终计入 `affectedGroups`。
- before/after 拓扑状态不同时，将原持久化 state 中所有 Workspace direct binding 引用的现有组计入 `affectedGroups`。
- `direct -> direct` 只要求显式旧/新组；同态 non-direct mutation 不扩大授权范围。
- `group-create` 在处理候选 binding 时显式传入原持久化 state 作为授权基线；候选新组仍不要求旧 grant。
- 授权仍发生在 commit、audit 与 grant revoke 之前，因此拒绝路径保持 state、audit、已有 grants 不变。

## 最终验证

| 门禁 | 结果 |
| --- | --- |
| `rtk pnpm --dir plugin exec vitest run tests/host/service.spec.ts` | 1 file / 41 tests passed |
| `rtk pnpm --dir plugin test` | 12 files / 170 tests passed |
| `rtk pnpm --dir plugin typecheck` | exit 0 |
| `rtk pnpm --dir plugin build` | exit 0；Host/CLI ESM 与 declarations 生成成功 |
| `rtk pnpm --dir plugin pack --dry-run` | exit 0；tarball 仅列出发布文件 |
| `rtk git diff --check` | exit 0 |

## 范围约束

- `artifacts/` 保持未跟踪，不进入提交。
- 未修改 `plugin/package.json`、Client 文件或 `./client` export。
- 未 merge、push 或 publish。
