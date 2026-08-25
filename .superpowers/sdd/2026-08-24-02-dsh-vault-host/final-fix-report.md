# DSH Vault Host Final Fix Report

## 状态

完成 final review 指定的 `1 Critical + 2 Important` 单次综合修复。工作基线为 `001852d5dc20301fbdccdbdc03c8580edeb299ae`。

## 审阅范围

- Host plan：`docs/superpowers/plans/2026-08-24-02-dsh-vault-host.md`
- 设计规范：`docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`
- final-review package：`.superpowers/sdd/2026-08-24-02-dsh-vault-host/final-review-8e4abdd..001852d.diff`
- progress ledger：`.superpowers/sdd/2026-08-24-02-dsh-vault-host/progress.md`
- 相关 Host contracts、request parser、service、state schema、binding resolver/mutations、repository 与测试

## 修复内容

### A. Critical：Host 授权边界

- `group-create` 与 `bindings-update` 的共享请求 contract 新增必填 `clientInstanceId` 和 `grants`。
- API parser 对新增字段保持 exact-shape 校验，并限制 client/group ID、grant token、credential version、grant 数量与 binding 数量。
- `VaultService` 在持久化前计算 mutation 前后所有受影响的现有密码组：
  - workspace/session replace 与 remove；
  - direct 与 inherited protection 的来源变化；
  - delete-group 的迁移源组和目标组；
  - group-create 覆盖已有 binding 或改变已有继承保护。
- 每个受影响现有组都必须由当前 `credentialVersion`、同一 `clientInstanceId` 的有效 grant 覆盖；缺失、跨 client 或陈旧版本统一返回 `invalid-credentials`。
- 无受影响现有组时允许空 grants；新建组本身不要求旧 grant。
- 授权失败不提交 state、不写 audit、不撤销有效 grants；提交成功后仍撤销全部受影响组 grants。
- `validateGrants` 同时校验 proof 声明的 credential version，避免 token 正确但 wire proof 版本伪造。

### B. Important：persisted state 语义校验

`parseVaultState` 在结构解析后拒绝：

- workspace 使用非 direct mode，或携带 `workspaceId`；
- direct 缺少、使用空值或引用不存在的 `passwordGroupId`；
- inherit/no-inherit 携带 `passwordGroupId`；
- 重复的 `targetType + targetId`；
- 空 target/group/workspace ID。

组存在性使用 `Object.hasOwn`，避免 `toString` 等原型属性绕过。合法的 soft-orphan target 继续允许；仅密码组引用必须存在。

### C. Important：repository load fail closed

- 新增统一 `invalidateVolatileState()`，清除 grants、failed attempts、activity touch throttle 与缓存 `#state`。
- 首次 load、正常 refresh、异常 revision，以及 conflict reload 失败均经过同一失效边界。
- conflict reload 前先失效 volatile authorization；即使恢复到相同 revision，旧 grant 也不会复活。
- load/refresh/reload 异常由 API 返回统一安全错误，不暴露内部错误。

### 回归夹具修正

新 persisted-state 语义正确暴露了 `tests/cli.spec.ts` 中 `session-direct -> other-group` 的悬空组引用。仅为夹具补充合法 `other-group`，保留原 member-count 与 emergency removal 语义；未修改 CLI production。

## TDD 证据

- 原基线：3 个相关测试文件，59 tests passed。
- test-only RED：3 files / 89 tests，19 failed / 70 passed。
- 最小 production 修复后：旧 mutation 调用尚未迁移时 10 failed / 79 passed。
- 原型属性回归 RED：state repository 1 failed / 43 passed；改用 `Object.hasOwn` 后 44/44 passed。
- 全量测试首次运行暴露 CLI 非法夹具：1 file failed，2 failed / 164 passed。
- 单独复现 CLI RED：2 failed / 6 passed；补齐合法组后 8/8 passed。

## 最终验证

| 门禁 | 结果 |
| --- | --- |
| `rtk pnpm --dir=plugin vitest run tests/host/api-request.spec.ts tests/host/service.spec.ts tests/host/state-repository.spec.ts tests/cli.spec.ts` | 4 files / 98 tests passed |
| `rtk pnpm --dir=plugin test` | 12 files / 166 tests passed |
| `rtk pnpm --dir=plugin typecheck` | exit 0 |
| `rtk pnpm --dir=plugin build` | exit 0；Host/CLI ESM 与 declarations 生成成功 |
| `rtk pnpm --dir=plugin pack --dry-run` | exit 0；tarball 仅含发布文件，不含 `src/` 或 `tests/` |
| `rtk git diff --check` | exit 0 |

## 范围约束

- 未修改 `plugin/package.json` 的 `./client` export；对应 artifact 按 final-review ruling 留给紧接着的 Client plan。
- 未派发 subagent/reviewer，未 merge、push 或 publish。
- `artifacts/` 保持未跟踪且不进入提交。
- 唯一提交消息：`fix(vault): enforce host authorization boundaries`。
