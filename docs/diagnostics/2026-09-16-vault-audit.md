# DSH Vault 插件诊断报告

日期：2026-09-16（Asia/Shanghai）

基线：Vault **0.2.5**，Git **ecb498f5feae7915ddf68a23165d4a4771926bb7**；本机 DSH **0.1.5-rc.1**，使用版本限定的宿主补丁。

性质：只读诊断与迭代建议。**本轮未修改插件实现、生产策略或保护关系，未部署、提交或发布新版本。** 工作区新增本报告；隔离探针保留在忽略目录。

## 一、总体结论

**基础功能已经恢复，但仍存在可靠性和前台隐私保护缺口，不宜宣称“完整、稳定的保护”。建议先修缺陷，再增加功能。**

此前“无法修改密码长度、无法给项目上锁”来自残留 state.lock 阻断状态读取。人工恢复了服务，但源码没有自动恢复能力。本轮扩大审查，又确认了恢复密钥交付中断、普通设置页暴露原始标题、继承保护的展示接缝不完整、首次快照未知时放行、并发限流缺口，以及 CLI 和备份回滚问题。

现有 **261 项测试及插件前后端类型检查均通过**。问题不是没有测试，而是没有充分覆盖真实 store 通知、宿主接缝、首次加载失败、并发时序和文件系统异常。

### 当前状态与边界

- 本轮真实服务只读检查：3080 只有 PID 49903 一个监听进程；认证快照 HTTP 200、ok:true，revision 16，1 个密码组、1 个绑定。安装版本与上述基线一致。报告不披露实际对象名称、凭据或 token。
- 当前实际策略：最小长度 4、无字符类别要求、不自动锁定、休眠锁定开启、3 次失败后暂停 1 秒。这不是软件默认值，也没有替用户修改。短密码与短冷却的组合保护较弱，但不能据此断言现有密码一定弱。
- 产品是**前台隐私锁，不是内容加密或后端内容授权**。直接访问原始文件、宿主内容 API 属于既定边界，不计作新漏洞。普通 UI 标题暴露则在其承诺的保护范围内。
- 未发现生产数据丢失的证据。备份问题来自隔离故障注入，不能描述成已发生的数据事故。

## 二、证据与优先级

运行时：真实服务或本轮前序故障恢复观察。隔离复现：真实相关代码，配合临时仓库、模拟 API 或 React DOM；不等于完整浏览器验收。静态确认：源码分支与调用链可直接验证。待验证：只有风险线索，不计作已确认漏洞。

P1：下一修复版优先处理，关闭前限制隐私保证。P2：近期可靠性、体验及工程治理改进。当前证据不足以宣布存在远程接管等 P0 灾难性漏洞；这不是不存在其他问题的证明。

## 三、优先修复项（P1）

### F01. 残留状态锁可使整个 Vault 持续不可用

**证据：真实故障＋静态确认。**

仓库以独占创建空文件作为进程间锁。异常退出后文件仍存在，重试耗尽后拒绝操作；没有锁拥有者信息和遗留锁安全回收机制。读取快照也要取锁，因此多个功能一起失效；服务统一返回 operation-failed，难以定位。

源码：
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/host/state/repository.ts:208–254
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/host/service.ts:76–93,365–371

前序人工恢复备份：/Users/Robbin/.dsh/backups/vault-stale-lock-20260916-130927。当时停止相关进程、隔离遗留锁再恢复服务，不是代码修复。

**建议：**评估受操作系统进程生命周期约束的锁；若保留文件锁，加入持有者唯一标识、PID／启动身份与安全回收协议。不能仅按年龄删除锁，避免误删活跃写锁。增加只读 doctor、明确错误码、受控恢复命令和单实例检查。

**验收：**持锁进程强制终止后可恢复；活跃锁不会被抢占；双进程竞争不损坏状态；诊断不泄露秘密。

### F02. 快捷上锁截断恢复密钥的首次交付

**证据：工作区／会话入口均隔离复现；与前序 Chrome 观察一致。**

store 先发布已锁定快照，行组件在 locked 时直接返回空内容，随后设置 recoveryKey 也无法显示。绑定已经成功创建，并非服务器未返回密钥。测试中保持组件挂载后再解锁，密钥才重新出现；刷新或卸载会丢失这次展示机会。

源码：
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/store.ts:340–360
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/rows/VaultRowAction.tsx:72,101–105,165

**建议：**把密钥交付放入独立于行生命周期的全局流程；目标立即锁定，但交付弹窗不随行隐藏消失，要求明确保存确认。不得靠把明文密钥写入日志或浏览器持久存储来修复。

**验收：**工作区／会话、折叠、切换、重渲染均不截断交付；确认关闭后不再展示；刷新中断后的处理有明确说明，不暗示服务器能再次读取旧密钥。

### F03. 普通设置页显示快捷上锁对象的原始标题

**证据：真实 store＋组件链路隔离复现；服务端字段静态确认。**

快捷上锁把 presentation.label 用作密码组名；快照保留 group.name；设置中的密码组页无需解锁便显示该名称，按钮 accessible name 也含原名。测试没有发起任何解锁请求。

源码：
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/rows/VaultRowAction.tsx:75
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/host/service.ts:425–426
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/settings/GroupsPanel.tsx:75–87

**建议：**自动生成非敏感组别名，统一普通界面的名称可见性；已有组名提供可预览迁移方案，不自动修改真实项目／会话标题。只隐藏文字却保留 aria-label 原名不算修复。

**验收：**锁定会话的唯一秘密标记不出现在设置页、DOM 文本、可访问名称和提示中；允许显示工作区名的策略另行验证。

### F04. 工作区继承保护在列表／搜索脱敏中丢失上下文

**证据：真实 decorator 隔离复现＋当前宿主接缝静态确认；尚未新增完整 Chrome 搜索复现。**

宿主调用 session(id, base) 不传 workspaceId。插件在无 workspaceId 且无显式会话绑定时直接保留原始展示，即使其他代码已经记住会话归属也如此。搜索结果随后使用该 presentation 渲染标题和摘要。正文被挡住不代表搜索展示安全。

源码：
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/rows/presentation.ts:63–73
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/.cache/dsh-v015/packages/client/ui-workspace/src/client/row-extensions.ts:70–71
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/.cache/dsh-v015/packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx:846–852
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/.cache/dsh-v015/packages/client/ui-workspace/src/client/rows/Rows.tsx:372–378

**建议：**版本化展示接缝传递权威 workspaceId；无法解析归属时保守脱敏，正文、侧栏、搜索和 hover 摘要共用保护解析结果。

**验收：**只锁工作区而不单独绑定会话时，搜索标题及正文片段仍遮蔽；显式会话保护、例外和无工作区会话分别回归。

### F05. 首次快照未知／首次加载失败时，保护提供者返回放行

**证据：真实 store＋provider 隔离复现；未量化真实页面暴露时间。**

初始快照绑定为空，解析器把“未查到绑定”当作 plain，provider 在检查 host 是否 ready 前就放行；首次请求失败进入 offline 后仍如此。**仅限尚未成功取得保护信息的冷启动路径，不等于已有绑定后每次断网都会放行。**

源码：
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/store.ts:134
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/access/resolution.ts:27–30
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/access/provider.ts:26–32,61–84,97–102

**建议：**区分“未知”和“已确认未保护”；宿主在保护服务初始化完成前提供等待／故障遮蔽层，避免 provider 不匹配直接绕过检查。不能只交换一个 if，忽略宿主匹配流程。

**验收：**慢网、首次快照失败、服务离线、恢复选中会话及插件注册时序不得提前显示受保护标题／正文；成功取得快照后普通对象可正常访问。

### F06. 并发密码验证突破组级失败尝试上限

**证据：真实 scrypt＋内存仓库隔离复现，主审计独立重跑。**

检查冷却后异步验证，失败计数发生在校验结束后，没有在途请求配额。上限 2，同时提交 4 个错误密码和 1 个正确密码，5 个请求都进入校验，结果为 invalid-credentials、cooldown、cooldown、cooldown、success。

源码：
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/host/service.ts:149–160
- /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/host/auth/attempts.ts:43–61,64–119

**影响：**上限不能限制并发批次验证量，KDF 消耗先发生；不代表无需正确密码即可解锁。

**建议：**按组串行验证或原子预留额度，解锁／改密／恢复共用并发控制，加有界队列。仅验证后补查冷却不足以控制计算消耗。

**验收：**并发进入 KDF 的数量有界；轮换 clientInstanceId 不绕过额度；冷却与在途成功请求的处理规则明确一致。

## 四、近期优化项（P2）

| 编号 | 已确认问题与边界 | 建议 |
|---|---|---|
| F07 | 设置中间态立即写入、失败无反馈。清空长度 8，立即发出 minLength:4 写入；成功／失败都只 refresh。确认的是组件写入请求，乱序覆盖未复现。 | 草稿与持久化值分离；提交或失焦校验，显示保存中／失败；串行或版本化写入。覆盖清空、4→12、网络失败，不自动放宽策略。 |
| F08 | 全部上锁不能撤销服务端在途解锁签发。lock-all 成功后早先验证仍签发有效 grant。客户端已有过期响应失效逻辑，未证明普通 UI 自动重新打开。 | 客户端／组撤销代次；签发前复核；测试上锁、改密、恢复与验证交叉。 |
| F09 | 应急 CLI 读取首个数据块而非首行，正确 ID 分块输入退出码 2；确认提示等 runCli 返回才输出，用户输入前看不到。 | 流输入按行读取；先输出范围与提示。覆盖 TTY、管道、分块、EOF 和拒绝确认，不降低删除保护的门槛。 |
| F10 | 失败提交不能完整保留旧备份代次。注入发布备份后的目录 fsync 失败，提交拒绝，state 回到 revision1，但 backup 从 revision0 变成 revision1。 | 事务结束前保留旧备份；成对恢复；补真实崩溃重启测试。不是生产主文件丢失证据。 |
| F11 | 兼容交付依赖手工宿主补丁，安装器只安装插件；prepare/export 默认仍 0.1.2。README 顶部提示 0.1.5，后文仍称完整支持 0.1.2；0.1.5 文档标题仍写 Vault0.2.4。 | 机器可读兼容矩阵、版本／接缝／已安装 bundle 指纹检查。未知组合不保证兼容；补丁工具支持 dry-run、备份、精确版本和回滚。 |
| F12 | Release 标签流程构建打包，但未显式依赖测试通过；说明文件固定 v0.2.5；CI 不运行浏览器 E2E、0.1.5 接缝回归。不等于现有 Release 已损坏。 | tag／包版本／说明一致性；复用测试门禁；兼容矩阵 E2E；发布后下载资产核验 SHA-256。 |
| F13 | 文档默认目录写 dsh-vault／XDG，实际为 DSH_HOME/vault-lock 或 ~/.dsh/vault-lock；写 PBKDF2／加密元数据，实际为 scrypt 验证器，组名／绑定未加密；快照“不含原始名称”与自动组名冲突。 | 文档逐项对照实现，准确区分加盐验证器、明文元数据、原始内容，并对真实目录做备份恢复演练。 |

### 位置索引

- F07：/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/settings/PolicyPanel.tsx:15–17,59–69；/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/settings/VaultSettingsCard.tsx:25–35。
- F08：/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/host/service.ts:128–131,152–160；客户端已有防护见 /Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/client/store.ts:326–337。
- F09：/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/cli.ts:89–100,165–166,213–216。
- F10：/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/host/state/repository.ts:331–345。
- F11：/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/install.sh；/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/scripts/prepare-dsh-source.mjs:11；/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/scripts/export-dsh-patch.mjs:11；/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/compat/dsh-v0.1.5-rc.1/README.md:1–38。
- F12：/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/.github/workflows/ci.yml:24–32；/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/.github/workflows/release.yml:23–42。本轮脚本测试的补丁检查仍针对 0.1.2，不能冒充 0.1.5 验收。
- F13：/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/README.md:60–83；/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/config.ts:41–59；/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/plugin/src/host/crypto/verifier.ts:48–85。

## 五、待验证及长期治理

以下不作为已复现漏洞：

1. **跨标签页撤销**：手动锁定按 clientInstanceId 撤销；先明确“全部”指当前客户端还是所有客户端，再做双标签页／双浏览器测试，决定广播或推送方案。
2. **Subagent、右侧面板、历史跳转、流式内容**：按入口建立保护矩阵，验证祖先保护、已打开面板和缓存，不能宣称这些入口均安全或均可绕过。
3. **休眠／后台节流**：当前用 timer drift 推断休眠，不能直接等同系统电源事件；需测实际睡眠唤醒、后台节流、主线程阻塞和恢复首帧。
4. **长期资源**：grant Map 的过期条目主要在访问对应 token 时清除，缺少全局清扫；实测反复解锁／关闭浏览器后的积累，再确定 TTL 清理和容量上限。
5. **审计完整性**：部分操作使用 best-effort audit；若要作为可靠恢复依据，另行定义事务一致性、轮转和保留策略，不能把当前日志当不可丢失账本。
6. **无障碍／移动端**：弹窗焦点进入、圈定、归还，Escape、键盘提交、390px 溢出需专项验收；此次未做人工视觉验收或全量无障碍扫描。
7. **跨平台**：此次 macOS 验证不能代表 Windows／Linux 的锁、fsync、CLI 与安装器实际行为。

## 六、迭代建议

### 第一阶段：修复版候选（建议 0.2.6，尚未创建）

目标：关闭 F01–F06；尽量同时处理 F07、F08。

- 先把隔离发现转为正式失败回归，再修复。
- 独立密钥交付、首次快照等待态、统一标题／摘要脱敏。
- 后端安全锁生命周期、并发额度、撤销代次及可诊断错误。
- 生产只做备份后的最小部署，不重置密码组、不删除绑定、不为通过验收降级策略。

### 第二阶段：可靠安装与运维版（建议 0.3.x）

关闭 F09–F13，建立兼容矩阵、只读 doctor、受控修复工具、备份恢复演练、安装／升级／回滚流水线。临时本机探针改为参数化、可复现、不依赖个人绝对路径的测试工具。

### 第三阶段：体验与架构收敛

统一对话框与保护状态模型，补键盘与错误恢复体验，完善跨客户端语义、资源清理及隐私入口矩阵。争取让必要接缝成为宿主稳定扩展 API，降低每次升级覆盖 bundle 的维护成本。

**不建议现在直接扩为真正的数据保险箱。** 如需抵御 API／磁盘读取，应另立内容加密、密钥管理、恢复和授权架构项目，不是继续给 UI 锁叠补丁。

## 七、下一次发布的验收门槛

1. 插件单测、host/client 类型检查、打包脚本全部通过。
2. 精确 DSH0.1.5 组合验证恢复密钥交付、策略、工作区／会话、继承、搜索、刷新、慢网、断线。
3. 并发验证、在途撤销、双进程写入、强制退出和 fsync 故障有回归。
4. 冷启动、设置页、侧栏、搜索、document.title 使用唯一秘密标记测试，不显示策略禁止的内容。
5. 安装后对照源码、构建、已安装文件证明运行时生效；测试通过不能替代部署验收。
6. 实施完成后执行 commit、push、tag、GitHub Release；版本／说明一致，重新下载资产核验校验和并保留回滚说明。**本轮是诊断报告，没有新 Release。**

## 八、本轮实际验证

| 检查 | 结果与限制 |
|---|---|
| 插件 Vitest | 25 文件、261 测试通过 |
| 插件 host/client 类型检查 | 两项均执行，无诊断输出；分项退出码已复核 |
| 安装与脚本测试 | 7/7 通过，补丁检查为 0.1.2 基线 |
| 前端针对性探针 | 6/6 缺陷断言成立；真实 store／组件／provider／decorator，API 模拟；8 个关键源文件与当前代码逐字节一致，主审计重跑 |
| 后端针对性探针 | 4 项缺陷断言成立；真实 scrypt、内存仓库及临时目录故障注入，主审计重跑 |
| 生产只读检查 | HTTP200／ok:true、revision16、唯一3080监听；不披露秘密 |
| 完整 DSH 类型检查／1407 宿主测试 | 本轮未重跑。2026-09-13 记录只能作为历史证据，不能计入本轮通过项；历史完整宿主类型检查未通过，不与本轮插件类型检查混淆 |
| 完整浏览器隐私矩阵 | 未执行；前序 Chrome 锁定／设置检查不覆盖本报告所有问题 |

**6/6 和 4 项针对性断言通过，表示缺陷已被复现，不是修复通过。**

证据目录：/Users/Robbin/Documents/WorkSapce/DeepSeek/DSH 插件/.cache/vault-audit-20260916/

包含单测与脚本日志、audit.spec.tsx、results.log、vault-audit-recheck.mts。探针只有测试数据，但带绝对路径和夹具依赖，不宜直接作为正式测试套件；后端重复运行须使用新的临时状态目录。

**最终建议：先交付可恢复、默认保守、各界面保护一致的锁，再追求更多功能。**
