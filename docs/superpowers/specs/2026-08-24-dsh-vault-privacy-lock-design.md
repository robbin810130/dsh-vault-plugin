# DSH 保险箱一期：前台隐私锁设计规格

- 日期：2026-08-24
- 状态：已完成分段确认，等待书面规格复核
- 产品名称：保险箱
- 技术定位：前台隐私锁，不包含会话数据落盘加密

## 1. 背景与目标

用户需要在 DSH 左侧栏为项目和对话启用密码保护，并在设置 → 插件 → 插件配置中管理密码、密码组和锁定策略。受保护条目必须有明确标识；用户通过正常 DSH 界面打开它们时，必须先完成密码验证。

一期先完成前台访问控制。DSH 原始 Workspace 注册、Session 日志和其他宿主持久化数据保持原格式，不迁移、不重写、不加密。真正的落盘加密、密钥托管和数据迁移属于二期。

## 2. 产品原则

1. **诚实命名**：一期状态文案使用“已上锁”“受保护”，不宣称“已加密存储”。
2. **默认拒绝**：Host 离线、令牌状态未知、守卫异常或配置冲突时保持锁定。
3. **不碰原始数据**：任何保险箱操作都不得删除 DSH 项目目录、Workspace 注册、Session 日志或消息。
4. **密码不落配置**：明文密码和恢复密钥不写入 `cordis.yml`、DSH Settings、日志或浏览器存储。
5. **DSH 原生感**：主体外观跟随 DSH 深浅主题，沿用其排版、尺寸、交互和 Slot 组合方式。
6. **最小宿主补丁**：DSH 补丁只提供通用的行级扩展、展示修饰和导航守卫，不包含保险箱业务逻辑。

## 3. 一期范围

### 3.1 包含

- 项目和对话独立上锁。
- 对话继承项目密码。
- 多个项目或对话共用一个密码组。
- 单个对话覆盖项目密码或明确不继承。
- 左侧栏锁状态、菜单操作和锁定名称遮罩。
- 设置页中的锁定策略、密码组、恢复能力和立即全部锁定。
- 当前标签页内的短期解锁令牌。
- 自动锁定、系统休眠锁定、手动锁定和 Host 重启锁定。
- 可配置的失败尝试保护。
- 密码修改、恢复密钥轮换和本机应急解除保护。
- 对侧栏、搜索、URL 直达、刷新恢复和 Fork 等入口的统一守卫。
- DSH 浅色、深色、窄屏和无障碍适配。

### 3.2 不包含

- Session 日志或 Workspace 数据落盘加密。
- 防御浏览器开发者工具、进程内存取证或直接读取磁盘。
- OS Keychain、TPM、Secure Enclave 或企业密钥托管。
- 多用户账户和跨设备解锁同步。
- 远程普通 HTTP 环境中的密码提交。
- 将现有 DSH 数据自动迁移到新存储格式。

## 4. 威胁模型

一期主要保护共享电脑上的正常产品界面访问和肩窥场景。未验证用户不能通过 DSH 提供的正常导航、搜索、最近记录、URL 恢复或对话视图查看受保护名称与正文。

拥有当前操作系统账户和文件读取权限的人仍可读取 DSH 原始会话文件；能使用浏览器开发者工具或进行进程内存取证的人也不在一期防御范围内。设置页必须明确展示该边界。

## 5. 总体架构

系统由三部分组成：

### 5.1 DSH 通用兼容补丁

补丁提供：

- 项目行和对话行的 accessory Slot。
- 项目行和对话行的 action Slot。
- 可组合的 Sidebar Row Presentation 装饰器。
- 集中式 Navigation Guard 服务。
- 对话根视图的访问状态检查。

补丁不知道密码、密码组和保险箱。未安装保险箱插件时，所有接口为空实现，DSH 行为和视觉不变。

### 5.2 Vault Host 插件

职责：

- 管理全局策略、密码组、绑定关系和恢复状态。
- 生成并验证密码 verifier。
- 维护失败次数、暂停期和内存令牌。
- 提供受保护目标查询、验证、锁定、改密和恢复 API。
- 原子保存私有状态。
- 提供应急解除保护 CLI。

### 5.3 Vault Client 插件

职责：

- 注册 DSH 行级 Slot、展示修饰器和导航守卫。
- 呈现已确认的 V3 设置卡片、锁定页、解锁框和错误恢复状态。
- 在标签页内存中持有解锁令牌。
- 处理空闲、页面可见性、系统休眠和 Host 断线。
- 确保被隐藏名称不进入 DOM、tooltip、ARIA 名称或可复制文本。

## 6. DSH 扩展契约

### 6.1 行级 Slot

```ts
'sidebar.workspaces.workspace.accessory'
'sidebar.workspaces.workspace.action'
'sidebar.workspaces.session.accessory'
'sidebar.workspaces.session.action'
```

accessory 用于状态标识；action 用于上锁、解锁、修改密码组、覆盖继承和解除保护。Slot 必须支持多个插件共存，并遵循 Cordis effect 生命周期自动卸载。

### 6.2 展示修饰器

```ts
interface WorkspaceRowPresentation {
  readonly label: string
  readonly detail?: string
  readonly ariaLabel: string
  readonly concealed: boolean
}

interface SessionRowPresentation extends WorkspaceRowPresentation {
  readonly workspaceLabel?: string
  readonly snippet?: string
}

interface WorkspaceRowDecorator {
  matchesWorkspace?(id: WorkspaceId, base: WorkspaceRowPresentation): boolean
  matchesSession?(id: SessionId, base: SessionRowPresentation): boolean
  workspace?(id: WorkspaceId, base: WorkspaceRowPresentation): WorkspaceRowPresentation
  session?(id: SessionId, base: SessionRowPresentation): SessionRowPresentation
  fallbackWorkspace?(
    id: WorkspaceId,
    base: WorkspaceRowPresentation,
    error: unknown,
  ): WorkspaceRowPresentation
  fallbackSession?(
    id: SessionId,
    base: SessionRowPresentation,
    error: unknown,
  ): SessionRowPresentation
}

interface WorkspaceRows {
  register(decorator: WorkspaceRowDecorator): () => void
  workspace(id: WorkspaceId, base: WorkspaceRowPresentation): WorkspaceRowPresentation
  session(id: SessionId, base: SessionRowPresentation): SessionRowPresentation
  subscribe(listener: () => void): () => void
}
```

Workspace Browser 在生成完整可见行模型后、渲染前依次应用修饰器。修饰器收到的是完整 presentation，而不是局部 override；保险箱可把真实项目名、对话名、路径详情、搜索片段、悬停详情、复制文本来源和无障碍名称替换为通用占位文案，但不得修改原始 Workspace/Session 对象。

`matchesWorkspace` 和 `matchesSession` 是可选同步快照匹配器；未提供时保持旧的“总是参与”行为。匹配器返回 `false` 的目标完全透传，保持原生 presentation 对象不被 decorator 触碰。匹配器、decorator 或 fallback 抛错时，DSH 不让异常冒泡破坏侧栏；对已匹配或匹配过程失败的目标使用 fallback，fallback 再失败则回落为通用遮蔽 presentation。多个修饰器按注册顺序组合，后续修饰器只能看到前序修饰后的 presentation；注册 disposer 必须恢复后续调用的基线行为。

搜索结果和最近记录必须复用同一展示修饰链，不能各自绕过。

### 6.3 导航访问

```ts
type NavigationAccessState =
  | { readonly kind: 'allow' }
  | { readonly kind: 'blocked'; readonly reason: string }

interface NavigationDecision {
  readonly allow: boolean
  readonly handled?: boolean
}

interface NavigationAccessProvider {
  matchesWorkspace(id: WorkspaceId): boolean
  matchesSession(id: SessionId): boolean
  workspaceState(id: WorkspaceId): NavigationAccessState
  sessionState(id: SessionId): NavigationAccessState
  requestWorkspace(id: WorkspaceId): Promise<NavigationDecision>
  requestSession(id: SessionId): Promise<NavigationDecision>
  subscribe(listener: () => void): () => void
}

interface NavigationAccess {
  register(provider: NavigationAccessProvider): () => void
  workspaceState(id: WorkspaceId): NavigationAccessState
  sessionState(id: SessionId): NavigationAccessState
  requestWorkspace(id: WorkspaceId): Promise<NavigationDecision>
  requestSession(id: SessionId): Promise<NavigationDecision>
  subscribe(listener: () => void): () => void
}
```

`matchesWorkspace`、`matchesSession`、`workspaceState` 和 `sessionState` 必须是同步、无 I/O 的本地快照查询。State API 只用于渲染和当前内容门禁：无匹配 provider 时返回 `{ kind: 'allow' }`；任一匹配 provider 返回 blocked 或同步查询抛错时，该目标按 blocked 处理。对话根视图订阅 `NavigationAccess.subscribe()`，用 `sessionState()` 覆盖“会话已打开后被另一操作重新锁定”的情况。

`requestWorkspace` 和 `requestSession` 是用户动作或程序化动作的异步准入 API。DSH 在打开目标、创建受 Workspace 约束的新会话、fork、rename、archive、Workspace rename/delete 等敏感原生动作产生副作用前等待 request 决策；任一匹配 provider 拒绝、抛错或匹配器抛错都 fail-closed 为拒绝，未匹配目标保持原生允许语义。`handled` 表示 provider 已经展示了解锁框、锁定页或其它 UI，DSH 不规定具体业务界面。

所有会话打开入口必须经过 runtime 公共 opening 边界：侧栏、搜索、最近记录、URL 直达、页面恢复、Fork 后自动打开、Subagent/Workflow 等插件调用和程序化 `sessions.open()` / `openSubagent()`。兼容层只提供通用 access registry，不包含保险箱、密码组或加密策略。

## 7. 数据模型

### 7.1 全局策略

```ts
interface VaultPolicy {
  autoLockMinutes: 15 | 30 | 60 | 0
  lockOnSystemSleep: boolean
  lockedNameVisibility:
    | 'workspace-visible-session-hidden'
    | 'all-visible'
    | 'all-hidden'
  failedAttemptProtection: {
    enabled: boolean
    maxAttempts: number
    cooldownSeconds: number
  }
}
```

默认值：

- `autoLockMinutes = 15`
- `lockOnSystemSleep = true`
- `lockedNameVisibility = 'workspace-visible-session-hidden'`
- `failedAttemptProtection.enabled = true`
- `maxAttempts = 3`
- `cooldownSeconds = 300`

失败保护关闭后不累计失败次数、不进入暂停期，并在设置页显示安全提示。若关闭时已有密码组处于暂停期，该暂停期执行完毕后不再产生新的暂停。

### 7.2 密码组

```ts
interface PasswordGroup {
  id: string
  name: string
  password: {
    salt: string
    verifier: string
    kdf: 'scrypt'
    parameters: {
      cost: number
      blockSize: number
      parallelization: number
      keyLength: number
    }
  }
  recovery: {
    salt: string
    verifier: string
    generatedAt: string
    lastVerifiedAt?: string
  }
  credentialVersion: number
  createdAt: string
  updatedAt: string
}
```

一期参数固定为 Node.js `crypto.scrypt`：`N=32768`、`r=8`、`p=1`、输出 32 字节、`maxmem=64 MiB`。salt 使用 16 字节密码学随机数。verifier 使用恒定时间比较。

密码按用户输入的 UTF-8 原文处理，不 trim、不做 Unicode 归一化；最少 8 个字符，最多 512 个 UTF-8 字节。空格允许存在。

### 7.3 保护绑定

```ts
interface ProtectionBinding {
  targetType: 'workspace' | 'session'
  targetId: string
  mode: 'direct' | 'inherit' | 'no-inherit'
  passwordGroupId?: string
  workspaceId?: string
  createdAt: string
  updatedAt: string
}
```

绑定使用 DSH 稳定 `WorkspaceId` 和 `SessionId`，不使用标题或显示路径作为身份。

对话解析优先级：

1. 对话直接绑定。
2. 对话明确不继承。
3. 当前项目的密码组。
4. 未保护。

对话移动到其他项目时，`inherit` 跟随新项目，`direct` 保留原密码组，`no-inherit` 保持未保护。

## 8. 解锁令牌与状态机

### 8.1 令牌

```ts
interface UnlockGrant {
  token: string
  groupId: string
  credentialVersion: number
  clientInstanceId: string
  issuedAt: number
  expiresAt: number
}
```

- token 为 256-bit 随机值，只向客户端返回一次。
- Host 仅保存 token 摘要。
- 客户端只存于当前标签页内存，不写 Cookie、LocalStorage 或 IndexedDB。
- 每个标签页使用独立 `clientInstanceId`。
- 令牌只能授权一个密码组及其当前成员。
- 密码、恢复操作、成员安全关系变化或 `credentialVersion` 变化立即撤销旧令牌。
- Host 重启清空全部令牌。

### 8.2 状态机

```text
LOCKED → PROMPTING
PROMPTING → LOCKED | REJECTED | COOLDOWN | HOST_UNAVAILABLE | UNLOCKED
REJECTED → PROMPTING | RECOVERY
COOLDOWN → LOCKED | RECOVERY
HOST_UNAVAILABLE → LOCKED | PROMPTING
RECOVERY → LOCKED | UNLOCKED
UNLOCKED → LOCKED
```

`UNLOCKED → LOCKED` 的触发条件包括空闲超时、系统休眠、页面刷新、标签页关闭、Host 重启或断线、手动锁定、密码修改、恢复、密码组删除和成员安全关系变化。

未知状态和异常统一进入 `LOCKED`。

### 8.3 空闲与休眠

- 有效活动包括键盘、指针、触摸、对话滚动和页面重新获得焦点。
- 活动上报最多每 60 秒一次。
- Client 和 Host 均检查过期时间，任一端过期即锁定。
- 使用单调时钟计算当前进程内的空闲时间。
- 使用定时器漂移和页面重新可见检查系统休眠；检测到明显漂移时立即锁定。
- `autoLockMinutes = 0` 表示仅关闭、刷新或手动锁定；休眠仍由独立开关决定。

### 8.4 失败尝试保护

计数按“密码组 + 客户端实例”保存在 Host 内存：

- 启用时使用配置的阈值和暂停时间。
- 成功验证、修改密码、完成恢复或 Host 重启后清零。
- 关闭后不累计、不暂停。
- 该机制用于普通界面误试和基础穷举抑制，不宣称具备二期加密级抗暴力破解能力。

## 9. 设置和凭据流程

### 9.1 创建密码组

流程为“基本信息 → 选择成员 → 设置密码 → 保存恢复密钥”。

- 密码组名称唯一。
- 已属于其他密码组的成员必须确认迁移。
- 项目成员默认展示其继承对话影响范围。
- 密码重复确认通过后，Host 生成 verifier。
- Host 生成高熵恢复密钥，页面只显示一次。
- 用户确认已保存恢复密钥后才完成创建。
- 中途取消不留下半成品组。

### 9.2 修改密码

当前密码或恢复密钥验证成功后才允许修改。修改保留成员关系，生成新 salt/verifier，递增 `credentialVersion`，撤销旧令牌并清除失败状态。恢复密钥默认不变，用户可选择同时轮换。

### 9.3 恢复

恢复流程为“验证恢复密钥 → 确认影响范围 → 设置新密码 → 生成并保存新恢复密钥”。成功恢复后旧恢复密钥永久失效，所有旧令牌撤销。

### 9.4 应急解除保护

密码和恢复密钥都丢失时，一期允许在 Host 本机执行：

```bash
dsh vault protection remove --group <group-id>
```

命令展示组名和成员，要求输入完整组 ID 确认，只删除保护绑定，不删除 DSH 数据，并写入不含敏感值的本地审计记录。Web 设置页不提供无凭据绕过按钮。二期真实加密不得直接沿用此语义。

## 10. 删除、归档与孤立状态

- 解除项目保护只删除绑定；继承对话随之未保护，直接绑定对话不变。
- 删除密码组前必须把全部成员迁移到其他组，或明确解除全部成员保护。
- 不允许保存指向不存在密码组的绑定。
- DSH 删除 Workspace 注册时，绑定进入“软孤立”状态，不自动清除；同 ID 恢复后重新生效。
- 孤立绑定由用户在设置页手动清理，自动清理默认关闭。
- 对话归档保留保护绑定；恢复归档后仍是锁定状态。
- 插件卸载只移除前台保护能力和内存令牌，不改变 DSH 原始数据。

## 11. 本地持久化

### 11.1 DSH Settings

只保存非敏感 `VaultPolicy`，通过正式插件设置命名空间提供给 V3 设置卡片。

### 11.2 Vault 私有状态

建议位置：

```text
$DSH_HOME/vault-lock/state.json
$DSH_HOME/vault-lock/audit.jsonl
```

- 目录权限 `0700`，文件权限 `0600`。
- `state.json` 保存密码组 verifier、绑定、恢复 verifier 和 schema version。
- 使用同目录临时文件、文件同步、目录同步和原子替换。
- 写入失败时保留旧状态且不签发新令牌。
- 启动时发现损坏文件则拒绝加载保护服务，保留损坏文件和最近可用备份，不静默重置。
- `audit.jsonl` 只记录应急解除、改密、恢复和成员迁移的时间、动作与非敏感 ID。

## 12. 网络边界

密码、恢复密钥和令牌只允许通过：

- `localhost` 或 `127.0.0.1`；或
- HTTPS 安全上下文。

远程普通 HTTP 只可查看锁定状态，不显示敏感输入提交按钮。界面提示用户改用本机或 HTTPS，不提供降级选项。

Host API 响应不得回传密码、恢复密钥、salt 或 verifier。日志和错误对象不得包含请求中的敏感字段。

## 13. UI 与文案

已确认的 V3 交互稿是视觉基线：

```text
.superpowers/brainstorm/97190-1787557899/content/vault-ui-interaction-v3.html
```

实现时统一调整：

- “已加密”改为“已上锁”。
- “内容仍然加密”改为“内容仍受保护”。
- 保留“保险箱”产品名称与锁形视觉。
- 设置页固定展示“一期仅控制 DSH 前台访问，原始会话文件未加密”。

锁定名称策略必须同时作用于行正文、搜索结果、悬停详情、tooltip、ARIA 名称和可复制文本。

## 14. 无障碍与响应式

- 状态不能只依赖颜色，必须同时使用图标和文字。
- 解锁框打开后聚焦密码框，关闭后返回原触发行。
- `Esc` 取消，`Enter` 提交。
- 错误状态使用 `aria-live`，不朗读用户输入。
- 暂停倒计时只在状态变化时播报，不每秒打断。
- 深浅主题正文对比度至少 4.5:1。
- 桌面沿用 DSH 控件尺寸；触屏点击目标至少 44px。
- 尊重 `prefers-reduced-motion`。
- 支持中文长名称、英文、窄侧栏、折叠侧栏和 390px 窄屏。

## 15. 错误处理

| 场景 | 行为 |
|---|---|
| 密码错误 | 保持锁定，按策略显示剩余次数 |
| 暂停期 | 禁用密码提交，显示结束时间 |
| Host 离线 | 保持锁定，允许重试连接 |
| 状态写入失败 | 保留旧状态，不签发令牌 |
| revision 冲突 | 刷新影响范围后重新确认 |
| 其他标签页改密 | 当前令牌失效并重新锁定 |
| 目标不存在 | 标记孤立，禁止静默迁移 |
| 系统时间跳变 | 当前进程内使用单调时钟判断超时 |
| 守卫或装饰器异常 | 受保护目标默认拒绝，普通目标保持原生行为 |

## 16. 测试策略

### 16.1 Host 单元测试

- scrypt verifier 创建、成功验证和错误验证。
- 参数、盐长度、输入长度和恒定时间比较。
- 密码修改及恢复使旧令牌失效。
- 恢复后旧恢复密钥失效。
- 失败保护启停、阈值、暂停和重启清零。
- 项目继承、独立覆盖和明确不继承。
- 原子写入失败后旧状态可继续读取。
- 状态损坏时拒绝加载并保留备份。

### 16.2 Client 单元测试

- 全部状态机转换。
- 空闲超时、页面隐藏和定时器漂移。
- 多标签页令牌隔离。
- 名称遮罩的所有呈现载体。
- 导航守卫默认拒绝。
- Host 断线、重连和令牌失效。
- 焦点、键盘、ARIA 和 reduced-motion。

### 16.3 DSH 契约测试

- 未安装保险箱插件时侧栏和对话行为不变。
- 多个 accessory/action 插件同时存在。
- 修饰器卸载后恢复原始呈现。
- 所有会话打开入口都经过导航守卫。
- HMR 后无重复 Slot、守卫、订阅或监听器。

### 16.4 集成测试

- 项目密码及继承对话一起解锁。
- 单个对话覆盖项目密码。
- URL、搜索、最近记录、页面恢复和 Fork。
- 项目移动、改名、归档、删除注册和重新出现。
- 修改密码、恢复、成员迁移和应急解除保护。
- Host 重启后全部重新锁定。

### 16.5 安全回归测试

- 配置、状态日志和应用日志中没有明文密码。
- 浏览器持久化存储中没有密码、恢复密钥或令牌。
- 远程普通 HTTP 无法提交敏感字段。
- 隐藏名称不在 DOM、tooltip、ARIA 或复制文本中出现。
- 过期、撤销和错误版本令牌不能继续访问。
- 未知错误保持锁定。

### 16.6 视觉回归测试

- DSH 浅色和深色主题。
- 宽侧栏、折叠侧栏和 390px 窄屏。
- 锁定、输入、错误、暂停、离线、恢复和已解锁状态。
- 中文长名称、英文名称和大量成员。

## 17. 交付顺序

1. 实现并验证 DSH 通用兼容补丁。
2. 实现 Vault Host 的状态、验证和令牌服务。
3. 实现 Vault Client 的导航守卫、行扩展和内容门禁。
4. 将 V3 设置与状态页面接入 DSH 原生主题和真实 API。
5. 完成单元、契约、集成、安全和视觉回归。
6. 生成可安装插件包与兼容补丁说明。

现有 DSH 项目和对话默认全部未保护。插件安装后不自动上锁，不进行数据迁移。卸载插件后 DSH 原始数据仍可正常使用。

## 18. 二期接口预留

一期不实现落盘加密，但保留以下升级边界：

- `credentialVersion` 可用于二期密钥轮换。
- 保护绑定不依赖物理存储路径。
- Host 验证和 Client 令牌不直接读取 Session 文件。
- 应急解除命令明确标记为一期语义。
- 二期通过新的 Session Persistence Provider 接入真正的加密存储和迁移工具。

二期启用前必须另行设计备份、恢复、部分迁移、回滚、密钥丢失和多后端兼容，不在本规格内预设实现。

## 19. 验收标准

1. 用户可在 DSH 插件配置页创建密码组并保护项目或对话。
2. 项目和对话可使用不同密码，也可共用密码组。
3. 受保护条目在侧栏中具有明确且可访问的锁定标识。
4. 未验证用户无法通过 DSH 正常 UI、搜索、URL 或恢复入口查看受保护内容。
5. 自动锁定、休眠锁定、手动锁定和 Host 重启锁定按策略工作。
6. 失败尝试保护可启用或关闭，阈值和暂停时间可配置。
7. 密码、恢复密钥和令牌不进入配置、日志或浏览器持久化存储。
8. 删除或解除保护不会删除任何 DSH 原始数据。
9. 浅色、深色、窄屏、键盘和屏幕阅读器流程通过测试。
10. 产品明确披露一期不提供落盘加密。

## 20. 参考依据

- DSH 插件开发基础：https://deepseek-harness.github.io/deepseek-harness/develop/basic/
- DSH 插件配置：https://deepseek-harness.github.io/deepseek-harness/develop/basic/config
- DSH 打包与安装：https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish
- DSH 设置卡片 Cookbook：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-settings-card.zh.md
- DSH UI Workspace：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-workspace/README.md
- DSH Session Persistence：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-persistence/README.md
