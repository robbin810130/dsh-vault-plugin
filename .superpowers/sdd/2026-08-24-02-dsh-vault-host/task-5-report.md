# Task 5 Report: Grants and configurable failed-attempt protection

## 状态

完成。仅在指定 `dsh-vault-host` worktree 新增进程内 grant store、失败尝试保护及对应单元测试；未修改此前任务语义。

## 读取文件

- `.superpowers/sdd/2026-08-24-02-dsh-vault-host/task-5-brief.md`
- `docs/superpowers/plans/2026-08-24-02-dsh-vault-host.md`（Global Constraints、Task 5、Task 6 集成边界）
- `docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`（令牌、状态机、失败尝试保护、错误处理与测试策略）
- `plugin/src/config.ts`
- `plugin/src/shared/contracts.ts`
- `plugin/src/host/state/model.ts`
- `plugin/src/host/state/schema.ts`
- `plugin/src/index.ts`
- `plugin/package.json`、`plugin/tsconfig.json`、`plugin/tsconfig.host.json`、`plugin/tsdown.config.ts`
- `plugin/tests/host/bindings.spec.ts`（既有测试风格）
- `.superpowers/sdd/2026-08-24-02-dsh-vault-host/task-4-report.md`、`progress.md`（前序边界与验证格式）

## RED

先只创建：

- `plugin/tests/host/grants.spec.ts`
- `plugin/tests/host/attempts.spec.ts`

随后运行：

```bash
rtk pnpm --dir=plugin vitest run tests/host/grants.spec.ts tests/host/attempts.spec.ts
```

结果：退出码 `1`，`2` 个 suite 均在导入阶段失败，关键预期错误：

```text
Cannot find module '../../src/host/auth/grants.js'
Cannot find module '../../src/host/auth/attempts.js'
Test Files  2 failed (2)
Tests       no tests
```

失败原因是两个 production 模块尚不存在，符合实现缺失型 RED。

## 实现摘要

- `InMemoryGrantStore` 使用 32 字节密码学随机值生成 base64url token；raw token 仅由 `issue()` 返回。
- Host 内存 Map 以 SHA-256 hex digest 为 key，record 仅保存 `groupId`、`credentialVersion`、`clientInstanceId` 与 monotonic deadline，不保存 raw token。
- grant 授权严格绑定 group/version/client；支持 group revoke、client revoke、clear，新 Host store 实例为空。
- grant 有效期只比较注入的 monotonic clock，生产默认 `performance.now()`；`Date.now()` 仅生成 `issuedAt` / `expiresAt` 展示值。
- `FailedAttemptStore` 以嵌套 Map 按 group/client 隔离 counter 与 cooldown。
- threshold 与 cooldown 秒数逐次读取传入 policy；达到阈值后保存 monotonic deadline，并单独保存 wall-clock `retryAt` 供展示。
- protection disabled 时，`check()` / `recordFailure()` 删除该 group/client 的已有状态；失败只返回普通 `rejected`，不创建、递增或保留 counter/cooldown。
- 成功验证、group reset、client reset、clear 与 Host 新实例均可清空对应失败状态。

## GREEN / 全量验证

- focused：`rtk pnpm --dir=plugin vitest run tests/host/grants.spec.ts tests/host/attempts.spec.ts` → `2` files、`10/10` tests passed。
- full：`rtk pnpm --dir=plugin test` → `6` files、`68/68` tests passed。
- typecheck：`rtk pnpm --dir=plugin typecheck` → exit `0`。
- build：`rtk pnpm --dir=plugin build` → exit `0`，tsdown 生成 `6` 个构建文件。
- diff-check：暂存四个实现/测试文件后运行 `rtk git diff --cached --check` → exit `0`。

## 自审风险

- 未增加依赖、日志、持久化或 shared contract 改动；未触碰主目录 `rtk-token-keeper`，未 merge/push/publish，未派 subagent/reviewer。
- 授权与 cooldown 的安全判断均不读取 wall clock；后续 Task 6 必须按 decision `kind` 执行拒绝，不能拿展示用 `retryAt` 反推授权状态。
- 已过期但从未再次 authorize/check 的内存记录采用惰性清理，仍可由 revoke/reset/clear 或 Host 重启清空；不影响授权正确性，但长期高频签发场景可在后续 service 生命周期层增加定期清理。
- 测试覆盖 SHA-256 存储、256-bit 随机请求、三元绑定、单调过期、group/client revoke、clear/restart、disabled 无状态、可配置阈值/暂停、成功重置与隔离。

## Commit

实现提交：`6f1b36cbb18acb19a11e30cf3ebd79e8b3c3c671`

提交信息：`feat(vault): issue grants and enforce attempt policy`
