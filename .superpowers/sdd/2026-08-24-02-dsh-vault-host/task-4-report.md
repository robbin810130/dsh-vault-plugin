# Task 4 Report: Binding and inheritance resolver

## 状态

完成。实现纯 session protection 解析与 binding/group mutation guards，供后续 service 直接组合使用。

## RED

先仅创建 `plugin/tests/host/bindings.spec.ts`，随后运行：

```bash
rtk pnpm --dir=plugin vitest run tests/host/bindings.spec.ts
```

结果：退出码 `1`，suite 导入失败，关键错误：

```text
Cannot find module '../../src/host/bindings/mutations.js'
Test Files  1 failed (1)
Tests       no tests
```

失败原因是 resolver/mutations production 模块尚不存在，符合预期 RED。

## GREEN

- 聚焦测试：`rtk pnpm --dir=plugin vitest run tests/host/bindings.spec.ts` → `1` file、`13/13` tests passed。
- plugin 全量：`rtk pnpm --dir=plugin test` → `4` files、`55/55` tests passed。
- typecheck：`rtk pnpm --dir=plugin typecheck` → exit `0`。
- build：`rtk pnpm --dir=plugin build` → exit `0`，tsdown 生成 `6` 个构建文件。
- diff-check：新增 production/test 文件逐一执行 `git diff --check --no-index` → exit `0`。

## 实现摘要

- `resolveSessionProtection()` 严格按 `direct session > no-inherit > current workspace > unprotected` 解析。
- session 移动后继承只按传入的当前 `workspaceId` 解析；direct session 继续按稳定 `sessionId` 生效。
- `applyBindingMutation()` 使用 `targetType + targetId` 精确替换/删除，revision 每次成功 mutation 加一。
- workspace 删除只删除对应 workspace binding，不级联删除 direct session binding。
- direct binding 必须引用已存在 group；group 删除的源 group 与迁移目标 group 均必须存在。
- group 删除必须且只能指定 `moveToGroupId` 或 `removeProtection: true`；所有校验完成后才返回新状态。
- group 迁移保留 archived session 与 soft-orphan workspace bindings；显式 removeProtection 才删除该 group 的成员 bindings。

## 自审

- 直接复用 `ProtectionBinding`、`BindingMutation`、`VaultState`、`PasswordGroup`，未复制前置接口。
- resolver/mutations 均为无 I/O 的纯函数；失败路径不修改输入 state、groups 或 bindings。
- 解析与 mutation 只比较稳定 ID，不使用名称、路径或展示文本。
- 测试覆盖 direct/no-inherit/workspace/unprotected、移动 session、缺失 group、删除歧义与部分请求、迁移、archived retention、soft-orphan restoration、workspace 删除隔离。
- 未增加依赖，未派发 subagent/reviewer，未改动 brief 外现有 production 文件。

## Commit

`feat(vault): resolve project and session protection`（本报告随该提交提交）

## Concerns

无阻塞项。resolver 假设持久化 binding 已通过 schema/mutation guard 形成有效 direct group 引用；group 是否仍存在由 mutation/service 状态校验负责。
