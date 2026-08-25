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
