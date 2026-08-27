# DSH Vault 需求变更记录

本文件为 Vault 插件的追加式变更日志。每次用户需求变更都记录原始诉求、设计决策、验证证据和交付状态，禁止覆盖历史条目。

## 2026-08-27：快速上锁流程与密码策略

### 原始需求

1. 输入确认密码与上一行密码不一致，点击保存没有提示。
2. 输入密码过程中切换到其他应用，再切回 DSH 页面时密码框消失；鼠标移到对话列表后又重新弹出。
3. 设置中加入密码强度要求，按实际配置决定复杂程度，而不是写死。
4. 后续每次需求变更都留下可追溯文档，便于排查。

### 当前设计决策

- 确认密码错误绑定到确认密码字段，提交时即时显示，修正后清除。
- 快速上锁窗口迁移到独立 overlay，生命周期不依赖 sidebar 行 hover 或焦点。
- 密码策略进入 Host 配置 schema，由 Host 与客户端共享；快速上锁、密码组创建、修改密码和恢复密码统一使用该策略。
- 计划配置项：最小长度、大小写、数字、符号要求；默认值保持当前安全基线。

### 实施状态

- 状态：已实施并完成审计。
- 实现范围：共享 `PasswordPolicy` 契约与校验器；Host 创建/修改/恢复密码统一校验；设置页可配置最小长度、大小写、数字和符号要求；快速上锁确认密码错误即时提示；快速上锁弹层通过 portal 挂到 `document.body`，脱离列表行 hover 生命周期；失败时保留输入内容。
- 测试证据：`pnpm -C plugin exec vitest run`，25 个测试文件、238 个测试通过；客户端类型检查通过；`node scripts/package-release.mjs` 和发布包测试通过。
- 实装验证：已安装到当前 DSH `web` profile；`GET/POST /dsh-vault/api` snapshot 返回 `passwordPolicy` 默认值；使用 `123` 创建密码组返回 `weak-password`，未写入状态。
- 关联提交：`375aee5`。
- 部署状态：当前 DSH 服务已由 supervisor 重启并监听 `127.0.0.1:3080`。

## 2026-08-27：升级后插件加载失败修复

### 现象与证据

- DSH 页面显示：`Failed to load plugins`。
- Loader 错误：`failed to import loader entry ...: process is not defined`。
- 根因：快速上锁改用 `react-dom` 的 `createPortal`，但客户端 bundle 没有把 `react-dom` 声明为 DSH 外部共享模块，导致 React DOM 被打进浏览器 bundle；其开发分支引用 `process.env`，在 DSH loader 环境中触发异常。

### 修复与验证

- 将 `react-dom` 加入 DSH client manifest 和 bundler external 列表，复用 DSH 原生运行时依赖。
- 新增 bundle 回归断言，确保共享模块不被重复打包。
- 修复提交：`6ea0a97`。
- 修复后 `vitest`、客户端类型检查、构建和发布包生成均通过；当前 DSH 页面 HTTP 200，Vault snapshot API 返回正常。
