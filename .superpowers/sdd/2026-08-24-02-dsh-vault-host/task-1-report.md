# Task 1 Report: Standalone Host package and shared wire contracts

## 状态

完成。已按严格 TDD 建立独立 `plugin/` 包、配置 schema、共享 wire contracts、空 Host 入口与最小 CLI 占位。

## 改动文件

- `plugin/package.json`
- `plugin/pnpm-lock.yaml`
- `plugin/pnpm-workspace.yaml`
- `plugin/tsconfig.json`
- `plugin/tsconfig.host.json`
- `plugin/tsdown.config.ts`
- `plugin/src/config.ts`
- `plugin/src/shared/contracts.ts`
- `plugin/src/index.ts`
- `plugin/src/cli.ts`
- `plugin/cordis.patch.yml`
- `plugin/tests/config.spec.ts`

## RED 证据

命令：

```bash
rtk proxy pnpm --dir plugin vitest run tests/config.spec.ts
```

结果：退出码 `1`。关键失败原因：`ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`，`plugin/package.json` 尚不存在，符合 brief 预期。

## GREEN / 验证

当前 pnpm `11.19.0` 对带空格工作树中的分离式 `--dir plugin` 参数解析异常，因此 GREEN 使用语义等价且可稳定执行的 `--dir=plugin` 写法。

```bash
pnpm --dir=plugin install
pnpm --dir=plugin vitest run tests/config.spec.ts
pnpm --dir=plugin exec tsc -p tsconfig.host.json --noEmit
pnpm --dir=plugin run build
node -e "import('./plugin/lib/index.js').then(m => { if (typeof m.apply !== 'function') throw new Error('Host entry is not loadable') })"
```

结果：全部退出码 `0`；Vitest `1` 个测试文件、`6` 个测试全部通过；TypeScript 无错误；tsdown 成功生成 `lib/index.js` 与 `lib/cli.js`；Host 入口可动态加载。

## 自审

- 包名、版本、ESM、Node 版本、DSH patch 路径与 loader 行均符合 brief。
- DSH Host peers 固定为 `0.1.1-rc.2`，Cordis 固定为 `4.0.1`。
- policy 默认值逐字匹配；非法尝试次数、冷却时间、auto-lock 值和相对 `stateDir` 均被拒绝。
- wire contracts 保持只读字段，并提供请求/响应 unions。
- Host `apply` 无副作用；CLI 仅为构建占位，没有提前实现 Task 7 功能。
- 未改动工作树外文件，未派发 subagent 或 reviewer。

## Commit

`build(vault): scaffold host plugin package`（本报告随该提交提交）

## Concerns

- `./client` export 按阶段规划指向 Task 3 才会生成的 `lib/client.js`；本任务未越界创建浏览器实现。
- pnpm 11 的依赖构建许可记录在 `plugin/pnpm-workspace.yaml`，仅允许 `esbuild` 安装脚本，保证后续非交互安装可复现。
