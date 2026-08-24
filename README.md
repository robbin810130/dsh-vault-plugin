# DSH Vault Plugin

DSH 保险箱插件项目。一期实现项目与对话的前台隐私锁，支持密码组、继承关系、自动锁定、恢复流程，以及跟随 DSH 的深浅外观。

> 一期只控制 DSH 前台访问，不加密原始 Workspace 或 Session 持久化数据。落盘加密计划在二期设计与实现。

## 当前资产

- 正式设计规格：[`docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`](docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md)
- V1–V3 交互原型：`.superpowers/brainstorm/97190-1787557899/content/`
- V2/V3 交互测试：同原型目录内的 `*.test.mjs`
- UI 审核记录：`.impeccable/critique/`
- DSH RTK 集成工具：`rtk-token-keeper/`

## 当前阶段

产品与技术规格已经完成复核。下一阶段是在规格基础上编写逐文件、逐测试的实施计划，然后再进入插件实现。
