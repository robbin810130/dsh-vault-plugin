# Task 6：Vault service and secure JSON API route

## 状态

完成。仅修改 Task 6 指定的 Host service、严格请求解析器、安全 JSON handler、共享 contracts、插件入口及对应测试；未添加任何客户端 UI 代码，未触碰 rtk-token-keeper。

## 实现

- VaultService 统一编排 repository、verifier、bindings、grants 与 failed-attempt policy。
- 创建、改密、恢复均在 durable commit 成功后才返回 recovery key；unlock 仅在验证成功后签发 client/group/version 绑定的 grant。
- 接入 cooldown、unlock、grant validate、60 秒 activity touch、autoLockMinutes = 0、lock/revoke/reset/dispose 生命周期。
- redacted snapshot 不包含 password、recovery verifier、salt 或 grant token，并深冻结输出。
- 组创建保留既有 bindings；新建 direct binding 缺少 group id 时归一到新组，错误 group id 拒绝；组名重复 fail closed。
- 改密、恢复、成员迁移写入经过 repository allowlist 校验的脱敏 audit event。
- 严格 union parser 拒绝未知字段、非法 action、越界字符串/数组/版本/token 及不满足密码边界的输入。
- 精确注册 POST /dsh-vault/api：只接受 application/json，流式读取并限制 256 KiB；必须带同源 Origin，HTTP 仅允许 localhost/127.0.0.1/::1，HTTPS 由真实 socket TLS 状态判定，不信任 x-forwarded-proto。所有响应统一 Cache-Control: no-store 与 application/json; charset=utf-8，错误不回显敏感内容。
- 入口通过 ctx.provide('vault', service) 暴露服务，并用 ctx.effect 注册/清理 exact route 与服务生命周期。

## TDD 记录

- RED：先创建 service/transport tests；初始运行因 Task 6 service/API 模块不存在而失败。
- GREEN：补齐最小 production code 后 focused suite 通过；随后以 HTTPS socket、缺失 Origin、direct binding 归一、重复组名和 snapshot 不可变性回归测试收紧边界。

## 验证

- rtk pnpm --dir=plugin vitest run tests/host/service.spec.ts tests/host/api-handler.spec.ts：2 files，12/12 passed。
- rtk pnpm --dir=plugin vitest run tests/host：7 files，85/85 passed。
- rtk pnpm --dir=plugin test：8 files，91/91 passed。
- rtk pnpm --dir=plugin typecheck：exit 0。
- rtk pnpm --dir=plugin build：exit 0，tsdown 完成。
- rtk git diff --check：通过。

## 提交

提交信息：feat(vault): expose secure host API

## Review fix round 1（基于 61325f2）

本轮只处理用户指定的 8 项 review findings；未派 subagent/reviewer，未触碰 rtk-token-keeper，未加入客户端 UI。

### Critical 1 — remote HTTP spoof

- RED：新增 tests/host/api-handler.spec.ts 真实 request double，带 socket.remoteAddress，覆盖远程 HTTP、loopback（127/8、::1、IPv4-mapped loopback）、userinfo/Host trick、重复 Host/Origin；focused handler 测试先因远程 HTTP 仍返回 200 而失败。
- 修复：HTTP 同时要求真实 socket loopback 与 WHATWG URL 严格同源；拒绝 userinfo、非根路径/查询/片段、重复头、forwarded spoof；HTTPS 允许远程但仍精确 same-origin。
- GREEN：vitest run tests/host/api-handler.spec.ts 4/4。

### Critical 2 — change/recover oracle 与 cooldown

- RED：新增 change/recover revision-first、错误凭据计数/cooldown、成功 reset、严格 clientInstanceId parser/contract 测试；初始 parser 拒绝扩展字段，service 在第二次错误凭据仍返回 invalid-credentials。
- 修复：wire contract 为 credential-changing actions 增加严格 clientInstanceId；revision 检查先于 credential 验证；change/recover 接入 FailedAttemptStore，失败计数/暂停，durable commit 成功后 recordSuccess。
- GREEN：vitest run tests/host/service.spec.ts tests/host/api-request.spec.ts 12/12。

### Critical 3 — lock 绕 cooldown

- RED：新增猜测→cooldown→lock-group/lock-all→正确密码仍 cooldown 回归；原实现 lock 后返回成功 unlock。
- 修复：lock lifecycle 只撤销 grants 与 touch 状态，不 reset failed-attempt counters/cooldown。
- GREEN：service lock regression 通过。

### Important 1 — binding/member security changes revoke grants

- RED：新增 replace/remove 及 delete-group migration 的旧组/新组 proof 失效测试；replace 后旧 proof 仍 valid。
- 修复：提交成功后收集 mutation 涉及的旧组与新组，统一 revoke；迁移同时撤销源组和目标组。
- GREEN：service binding regression 通过。

### Important 2 — audit failure after durable commit

- RED：新增 create/change/recover 的 appendAudit fault double；create 没有调用 audit，change/recover 的 audit failure 会把已提交结果变成失败。
- 修复：create/change/recover/migration 使用 best-effort safeAudit；audit failure 不改变已 durable commit 的成功结果，不记录秘密。
- GREEN：audit fault regression 通过，one-time recovery results 保持成功可用。

### Important 3 — post-publish directory fsync rollback

- RED：新增真实 faulting filesystem，在 backup rename 后第二次 directory fsync 抛错；API/commit 失败但磁盘仍为新 revision。
- 修复：跟踪 backupPublished；发布后 fsync 失败时用已发布旧 backup 尽最大可能恢复主 state 并再次同步目录，保留 Task 3 cleanup/backup 语义。
- GREEN：repository fsync regression 通过；state/revision/credentials 回到旧 durable state。

### Important 4 — lock-group scope

- RED：新增 GrantStore 同组双 client 测试；原 API 无 revokeGroupForClient。
- 修复：增加最小 revokeGroupForClient(groupId, clientInstanceId)，lock-group 只撤销发起 client；lock-all 仍只 revokeClient。
- GREEN：grant/service scope regressions 通过。

### Important 5 — Cordis injection

- RED：新增 tests/index.spec.ts，先验证 apply.inject 为 ['webServer'] 且依赖缺失时不注册；原 apply.inject 为 undefined。
- 修复：导出 apply.inject = ['webServer'] as const，保留 ctx.effect 内访问 ctx.webServer，并保持 Context augmentation 与 Cordis 加载顺序。
- GREEN：Cordis integration 1/1。

## Round 1 verification

- focused review suites：6 files / 58 tests passed。
- Host suite：8 files / 94 tests passed。
- Full suite：10 files / 101 tests passed。
- pnpm --dir=plugin typecheck：passed。
- pnpm --dir=plugin build：passed，tsdown complete。
- git diff --check：passed。
- git diff --cached --check：passed。

## Review fix round 2

本轮只处理 3 项仍开放 Important；未派 subagent/reviewer，未触碰 rtk-token-keeper，未加入客户端 UI。

### Important 1 — 隐式成员关系变化撤销旧 grant

- RED：新增 service 回归测试覆盖 session inherit→no-inherit、remove、direct→inherit，以及 workspace binding replacement；旧 affectedGroups 只读取显式 passwordGroupId，继承 workspace grant 仍为 valid。
- 修复：按 mutation 前后状态调用 `resolveSessionProtection`，收集受影响 target 的有效旧/新保护 group；workspace mutation 仅纳入 workspace 来源的继承 session；提交成功后统一撤销这些 group grants。
- GREEN：focused service suite 18/18；变更 focused suite 全部通过。

### Important 2 — rollback 文件 durability

- RED：fault test 在 backup publish 后第二次 directory fsync 失败时，旧 state 内容虽恢复但恢复后的 state.json 未发生 file sync。
- 修复：`copyFile(backup, state)` 后以 `r+` 打开恢复的 state 文件并 fsync，再 fsync directory；file/directory rollback 失败继续聚合为 persistence error，不返回成功。
- GREEN：repository rollback fault test 通过，旧 revision、password/recovery verifier 内容保持。

### Important 3 — Cordis 顶层 inject

- RED：将测试改为真实 module namespace 传入 `ctx.plugin(namespace, config)` 后，namespace 的 `inject` 为 undefined，依赖未声明。
- 修复：模块顶层导出 `inject = ['webServer'] as const`，并保留 `apply.inject = inject` 兼容行为；测试验证依赖缺失时 pending、提供 webServer 后激活并注册 route。
- GREEN：真实 namespace/Cordis integration 1/1。

## Round 2 verification

- focused：3 files / 45 tests passed。
- Host suite：8 files / 98 tests passed。
- Full suite：10 files / 105 tests passed。
- typecheck：passed。
- build：passed，tsdown complete。
- diff-check：待提交前执行。
