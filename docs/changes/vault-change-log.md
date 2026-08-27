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

### 二次排查

- 首次重新安装仍显示旧错误，核对发现 DSH profile 的 `package.json` 与 lockfile 仍指向旧的 `/tmp/dsh-vault-plugin.tgz`，同路径同版本没有触发内容替换。
- 使用带唯一文件名的新 tarball 重新执行原生 `dsh plugin --profile web add`，安装目录已更新；安装后的 `lib/client.js` 不再包含打包的 `react-dom` 或 `process.env`。
- 最终验证：DSH 根页面 HTTP `200`，不再返回 `Failed to load plugins`；服务继续监听 `127.0.0.1:3080`。

## 2026-08-27：配置最小长度与原生输入控件一致性

### 原始需求

1. 密码输入框必须遵循 DSH 原生输入控件的边框、背景、尺寸和主题变量。
2. 密码策略允许最小长度为 4，并启用大写、小写、数字、符号要求时，`Aa-1` 应可保存并立即上锁。

### 根因与设计决策

- Host 加密校验器仍固定拒绝少于 8 个 Unicode code point；客户端策略虽已允许 4，但创建后在 `createVerifier` 阶段失败。
- 将用户密码校验器改为接收当前 `passwordPolicy.minLength`；恢复密钥继续使用独立的默认安全下限，避免策略放宽影响恢复凭据。
- 密码、文本、数字和选择控件统一复用 DSH alias token；密码控件补齐与原生控件相同的 `height/border/background/radius`，主按钮复用原生 primary fill/hover/foreground token。
- 展开箭头改用 DSH 其他插件采用的无 SVG 边框 chevron 方案，保持浅色/深色主题由 alias token 自动切换。

### 验证证据

- `pnpm -C plugin exec vitest run`：25 个测试文件、240 个测试通过。
- 新增 verifier 回归：4 位用户密码可创建并验证；新增 VaultService 端到端回归：策略允许时 `Aa-1` 创建与解锁成功。
- `pnpm -C plugin run typecheck` 与 `pnpm -C plugin run build` 通过。
- 已使用唯一文件名 `/tmp/dsh-vault-plugin-20260827-final2.tgz` 重新安装并重启 DSH；根页面 HTTP `200`，安装包中的客户端 CSS 已确认包含密码控件样式、原生 primary hover token 与边框 chevron，且 bundle 不含 `process.env`。

## 2026-08-27：受保护行布局与界面披露文案

### 原始需求

1. 受保护行右侧状态文字发生窄容器换行，影响对话列表布局。
2. 密码组操作按钮应保持同一行、统一对齐。
3. 删除界面中的“ 一期仅控制 DSH 前台访问，原始会话文件未加密 ”披露文案。

### 实施决策

- 受保护行保留锁图标作为可见状态，状态文字改为无障碍标签，避免挤压原生会话标题和时间列。
- 密码组删除操作并入同一组操作按钮，列表改为无默认项目符号的 flex 行布局。
- 快速上锁输入的 `minLength` 改为读取当前策略，不再写死 8。
- 删除设置卡片中的实现细节披露文案，并同步更新回归测试。

## 2026-08-27：受保护会话解锁入口无响应

### 原始需求

- 所有会话显示为上锁，点击锁或解锁入口没有反应。

### 根因与修复

- `VaultRowAction` 在锁定状态下只调用可选的 `onUnlock`；DSH 原生 action slot 未提供该回调，因此点击后直接返回。
- `conversation.access.denied` slot 只传入 `sessionId`，没有传 `workspaceId`；当会话继承工作区保护时，无法解析密码组，解锁按钮被错误禁用。
- 行装饰器记录 DSH 已提供的 `sessionId → workspaceId` 映射；受保护内容组件复用该映射解析目标。锁定操作在缺少宿主回调时直接向 Vault store 请求对应密码组解锁。

### 误判修正

- DSH 的 `workspaceRows.session` 回调实际只传入 `(sessionId, presentation)`，不会传 `workspaceId`；之前对缺少 workspaceId 的会话调用 `resolveVaultTarget` 会把“存在任意工作区保护”误判为当前会话受保护。
- 现在仅在存在明确会话绑定时进行行名称隐藏；无 workspaceId 的隐式工作区保护交由导航访问层在拥有真实 workspaceId 时判定，避免未加锁会话被显示为 `Protected session`。
- 行操作组件收到工作区 ID 时记录会话归属，供被拒绝内容视图恢复正确的解锁目标。
- 导航访问层的 `matchesSession` 在 DSH 尚未提供工作区上下文时不再拦截隐式会话；最终是否允许访问仍由 `requestSession(id, workspaceId)` 判定。
- 当前对话访问检查复用已记录的会话工作区映射；工作区重新上锁后，导航订阅会立即将当前会话切换到受保护视图。
- 工作区锁定成功后立即收起对应工作区行，避免锁定内容继续暴露在展开的会话列表中。
- 工作区已锁定时只显示彩色“已上锁”状态，不再重复渲染上锁按钮；点击受保护会话只进入内容页的解锁状态，不自动弹出密码对话框。
- 所有锁定列表行均不再提供解锁按钮；工作区和会话列表点击只负责导航/展示状态，密码解锁只能由主内容区按钮发起。
- 受保护会话的选择允许进入主内容区锁定页，由内容访问状态阻止真实内容渲染；这样列表点击有明确反馈，同时不会自动弹出密码框。
- 锁定工作区条目同样允许进入 DSH 的受保护占位状态，避免工作区行点击被无提示吞掉；真实内容仍由内容访问状态拦截。
- 工作区锁定状态通过原生工作区行的 `aria-expanded` 变化持续监听；即使用户再次尝试展开，也会立即收回下游会话清单。

### 兼容性边界补充

- 密码策略只约束新建、修改和恢复密码；解锁验证不再套用当前最小长度，避免用户提高策略后历史密码突然全部失效。
