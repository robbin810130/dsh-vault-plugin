# Task 2 Report: Typed browser API client and redacted snapshot store

## 状态

完成。浏览器端现具备固定同源 Vault API client、当前标签页内存态 grant 管理，以及深度不可变的脱敏 snapshot store；未进入 Task 3 的 DSH provider、导航或 UI 集成。

## RED 证据

先创建 `api.client.spec.ts` 与 `store.client.spec.ts`，再运行：

```bash
pnpm exec vitest run tests/client/api.client.spec.ts tests/client/store.client.spec.ts
```

初始结果：退出码 `1`，两个 suite 分别因缺失 `src/client/api.js` 与 `src/client/store.js` 失败，确认测试先于生产实现。

契约审计时又补充了运行时不可改写 `clientInstanceId` 的测试。该测试首次运行退出码 `1`，错误为 `expected [Function] to throw an error`；随后将公开字段改为私有字段加只读 getter，focused store 测试恢复为 `7/7` 通过。

Client typecheck 首次接入 shared contracts 后退出码 `2`，具体错误来自 `src/shared/contracts.ts` 对 Node-only `src/config.ts` 的类型依赖：`node:os`、`node:path`、`NodeJS` 与 `process` 无法出现在 browser-only 类型环境。最小修复为把纯 `VaultPolicy` 接口移入 `src/shared/contracts.ts`，并由 `src/config.ts` 类型导入/再导出；Host 运行时行为与公开类型保持不变。

## 最小实现

- API 固定向 `/dsh-vault/api` 发送 JSON `POST`，设置 `credentials: 'same-origin'`、`cache: 'no-store'`，并原样传递 `AbortSignal`。
- 非 2xx、网络失败、Abort、畸形 JSON、畸形 envelope、未知错误码及 action-specific 畸形结果全部返回静态净化错误，不透传 Host message 或底层异常。
- 每个 store 只调用一次 `crypto.randomUUID()`；ID 保存在私有字段中并通过无 setter getter 暴露。
- 当前标签页 grant proof 只保存在私有 `Map<string, GrantProof>`；snapshot 不包含 token。
- snapshot 对数组及其元素、prompt/target 做复制与冻结；`unlockedGroupIds` 使用无 mutator 的私有 Set 包装，Host 原对象或调用方均不能反向修改 store。
- `refresh()` 先发布 Host 的 redacted snapshot 和锁定视图，再逐一验证本标签页当前 proofs；无效、过期或 credentialVersion 不匹配的 proof 被剔除。
- Host 不可用、响应畸形或请求中止时，公开 snapshot 立即隐藏 unlocked 状态；尚未被 Host 判定失效的 proofs 留在私有内存中，后续 `refresh()` 可重试验证。
- `lockGroup()` 与 `lockAll()` 先本地 fail closed，再调用 Host。
- `group-create` 与 `bindings-update` 自动附加当前 `clientInstanceId`、`expectedRevision` 和当前 proofs；改密与恢复附加 `clientInstanceId`、`expectedRevision`。

## 秘密生命周期

- Password 与 recovery key 仅存在于调用方 input、动作函数局部 request 和成功返回值中；store 不把 input/request/response 保存到实例字段。
- Grant token 仅在 unlock 返回值和 store 私有 grant Map 中存在；发送时只创建短生命周期 proof 副本。
- Credential 变化、恢复、显式锁定、Host 判无效或本地版本不匹配时，对应 proof 会被删除；`lockAll` 和无效 activity 会清空全部 proofs。
- Snapshot、listener 通知、错误对象和日志均不包含 password、recovery key 或 grant token；实现不调用 console，也不访问 Cookie、LocalStorage、SessionStorage 或 IndexedDB。

## 改动文件

- `plugin/src/client/api.ts`
- `plugin/src/client/store.ts`
- `plugin/src/client/store-types.ts`
- `plugin/tests/client/api.client.spec.ts`
- `plugin/tests/client/store.client.spec.ts`
- `plugin/src/shared/contracts.ts`
- `plugin/src/config.ts`
- `.superpowers/sdd/2026-08-24-03-dsh-vault-client-integration/task-2-report.md`

其中 `config.ts` / `shared/contracts.ts` 仅用于解除 browser contracts 对 Node-only 配置模块的类型耦合。

## GREEN / 验证

| 门禁 | 结果 |
| --- | --- |
| focused API/store tests | 2 files / 11 tests passed |
| full test suite | 15 files / 185 tests passed |
| Client typecheck | exit 0 |
| Host typecheck | exit 0 |
| build | exit 0 |
| pack dry-run | exit 0；仅包含 allowlisted package/lib/docs 文件，不含 `src/`、`tests/`、`artifacts/` |
| Client source/bundle forbidden-reference scan | 无 browser storage、console、`node:`、Host service/parser/crypto/state 引用 |
| `git diff --check` | exit 0 |

## 边界

- 未修改 `src/client/index.ts`，API/store 与 DSH slots、provider、UI 的装配留给 Task 3。
- 未修改、暂存或提交既有未跟踪 `artifacts/`。
- 未 merge、push 或 publish。
