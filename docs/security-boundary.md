# 安全边界

## 一期保证什么

- 锁定 DSH 前台中的 Workspace、Session、导航和对话内容访问。
- Host 侧保存验证器、恢复、绑定和审计状态；配置只保存非敏感策略。
- 目标 provider 匹配且 Host 离线或访问异常时拒绝访问；未匹配 provider 保持 DSH 原生 allow 行为。
- 自动锁定、休眠漂移检测和手动立即全部上锁可用。

## 一期不保证什么

**一期不加密原始 Workspace 或 Session 持久化文件。** 文件级落盘加密属于二期范围。因此：

- 不能把本插件当作磁盘加密、数据库加密或备份加密方案。
- 拥有 DSH 数据目录读取权限的本机用户，仍可能直接读取原始数据。
- recovery key 是恢复能力，不是替代操作系统账户、磁盘加密或 Host 权限控制的万能密钥。

## 敏感信息处理

密码、recovery key、grant token 不得进入：

- DSH 配置文件；
- 日志和错误遥测；
- 浏览器 localStorage、sessionStorage 或 IndexedDB；
- 发布包、源码归档和测试 fixture。

发布包只应包含构建后的 lib/、package.json、cordis.patch.yml、README 和 LICENSE。发布前运行包内容测试。
