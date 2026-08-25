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

---

# Task 5 Fix Round 1 Report

## 状态与范围

2026-08-25 完成。基于 `f3bd8486bd074ba61ea3f7f04afd02284bc033c7`，只修复 reviewer 指定的三个 Important 及其直接安全边界；未处理额外 Minor，未派 subagent/reviewer，未 merge/push/publish，未触碰主目录 `rtk-token-keeper`。

## 本轮读取文件

- `.superpowers/sdd/2026-08-24-02-dsh-vault-host/task-5-brief.md`
- `.superpowers/sdd/2026-08-24-02-dsh-vault-host/task-6-brief.md`
- `.superpowers/sdd/2026-08-24-02-dsh-vault-host/progress.md`
- `docs/superpowers/plans/2026-08-24-02-dsh-vault-host.md`（Global Constraints、Task 5/6）
- `docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`（7.1、8.3、8.4）
- `plugin/src/config.ts`
- `plugin/src/shared/contracts.ts`
- `plugin/src/host/state/model.ts`
- `plugin/src/host/auth/grants.ts`
- `plugin/src/host/auth/attempts.ts`
- `plugin/tests/host/grants.spec.ts`
- `plugin/tests/host/attempts.spec.ts`

## 严格 TDD：RED

先只修改两份测试文件，未改 production，运行：

```bash
rtk pnpm --dir=plugin vitest run tests/host/grants.spec.ts tests/host/attempts.spec.ts
```

结果：exit `1`，`9 failed | 9 passed`。三个 Important 分别得到实现缺失/行为缺失型 RED：

1. **Grant 生命周期**
   - `store.touch is not a function`，证明 activity-touch/滑动续期能力缺失。
   - `ttlMs=0` 抛出 `Grant TTL must be a positive finite number`，证明无空闲期限模式缺失。
2. **Monotonic fail-closed**
   - `NaN` 下既有 grant 的 `authorize()` 实际返回 `true`。
   - 非有限 issue clock 未抛错；touch/deadline overflow 路径缺失。
   - attempt clock 为 `NaN` 时 `check()` 实际返回 `allowed`；`Infinity` 会污染 cooldown deadline，之后无法按原 deadline 自然结束。
3. **disabled 策略转换**
   - `store.setPolicy is not a function`，Task 6 无可靠全局转换入口。
   - 首次观察 disabled 只清当前 pair，未访问 pair 的旧 counter 仍被恢复，重新启用后实际 `remainingAttempts: 1`，预期为全局清除后的 `2`。

## 修复摘要

### 1. Grant touch、滑动续期与 0 TTL

- `GrantStore` 新增 `touch(token, groupId, credentialVersion, clientInstanceId, ttlMs)`。
- touch 先验证 raw token digest 对应记录及 group/version/client 全绑定；任一 proof 不匹配都不刷新 deadline。
- touch 成功时基于注入 monotonic clock 重建 idle deadline，实现滑动续期。
- `ttlMs=0` 表示进程内无 idle deadline；展示值统一为导出的 `NO_IDLE_EXPIRY = 0`。
- `expiresAt` 明确为 display-only；授权与续期从不使用 wall clock 判断。

### 2. Grant/attempt monotonic clock fail-closed

- Grant issue/authorize/touch 统一校验 monotonic 值必须有限且不低于进程内已观察高水位。
- Grant clock 非有限或回退时清空内存 grants：issue 抛 `RangeError`，authorize/touch 返回拒绝。
- 正 TTL deadline 要求加法结果有限且严格晚于当前 monotonic 值；issue overflow 抛错，touch overflow 撤销该 grant 并拒绝。
- Attempt store 同样维护 monotonic 高水位；`NaN`、`Infinity`、回退时不删除或绕过已有 cooldown。
- Attempt `check()` 遇到异常 clock 不返回 `allowed`；已有 cooldown 返回其原 `retryAt`，无 pair 状态也返回临时 fail-closed cooldown 展示结果，不持久化伪 deadline。

### 3. disabled 全局策略转换

- 新增公开 `setPolicy(policy)`，供 Task 6 在策略采用时可靠调用；`check/recordFailure` 也会先同步策略，避免访问顺序影响。
- disabled sweep 全局删除所有未达阈值 counters，只保留已有 cooldown。
- disabled 下 `recordFailure()`：已有且未自然结束的 cooldown 继续返回 cooldown；否则普通 `rejected`，不创建或递增状态。
- cooldown 在可靠 monotonic clock 到达原 deadline 后自然删除；重新启用不会恢复已清 counter，仍有效的旧 cooldown 继续执行。

## GREEN 与完整验证

- focused：`rtk pnpm --dir=plugin vitest run tests/host/grants.spec.ts tests/host/attempts.spec.ts` → exit `0`，`2` files、`19/19` tests passed。
- full：`rtk pnpm --dir=plugin test` → exit `0`，`6` files、`77/77` tests passed。
- typecheck：`rtk pnpm --dir=plugin typecheck` → exit `0`。
- build：`rtk pnpm --dir=plugin build` → exit `0`，生成 `6` 个构建文件。
- diff-check：`rtk git diff --check` → exit `0`。

## 自审风险

- `expiresAt=0` 是无 idle expiry 的展示哨兵，不是安全 deadline；Task 6 必须直接使用 `authorize/touch` 结果。
- monotonic 回退后 attempts 会保持 fail-closed，直到时钟重新达到此前高水位；这是对 cooldown 不可绕过的保守取舍，Host 重启会建立新时钟纪元。
- 非有限 attempt clock 且当前 pair 无状态时，`check()` 返回 display-only 的即时 `retryAt`，不写入 counter/cooldown；调用方应按 `kind` 拒绝，不以 `retryAt` 反推授权。
- 未增加依赖、日志或持久化；raw grant token 仍只在 issue 返回一次，store 仅持有 SHA-256 digest。

## Commit

提交信息：`feat(vault): issue grants and enforce attempt policy`

本轮 commit SHA 由提交完成后的最终回复给出。
