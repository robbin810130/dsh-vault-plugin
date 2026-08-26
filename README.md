# DSH Vault Plugin

DSH 保险箱插件项目。一期实现项目与对话的前台隐私锁，支持密码组、继承关系、自动锁定、恢复流程，以及跟随 DSH 的深浅外观。

> 一期只控制 DSH 前台访问，不加密原始 Workspace 或 Session 持久化数据。落盘加密计划在二期设计与实现。

## 当前资产

- 正式设计规格：[`docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`](docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md)
- V1–V3 交互原型：`.superpowers/brainstorm/97190-1787557899/content/`
- V2/V3 交互测试：同原型目录内的 `*.test.mjs`
- UI 审核记录：`.impeccable/critique/`
- ~~DSH RTK 集成工具~~：`rtk-token-keeper/` 已独立为单独仓库（`dsh-rtk` 插件，见 https://github.com/robbin810130/dsh-rtk）

## 当前阶段

产品与技术规格已经完成复核；针对 DSH `v0.1.1-rc.2` 的通用兼容层补丁也已实现、测试并完成复核。补丁覆盖导航访问边界、Workspace/Session 行级扩展、真实会话启动结果，以及异步授权与排序的 latest-gesture-wins 语义，可作为一期插件实现的稳定宿主基础。

## 安装与边界

- 安装、升级、回滚：[docs/install.md](docs/install.md)
- 安全边界：[docs/security-boundary.md](docs/security-boundary.md)
- 生成发布包：`node scripts/package-release.mjs`

当前已具备可打包的 Host/Client 实现和包内容校验；真实 DSH `0.1.1-rc.2` 启动夹具、Playwright E2E 及完整设置工作流仍需单独验收，不能据此宣称整项发布验收完成。
