# Task 1 Report: Client build face and DSH loader artifact

## 状态

完成。已在保留 Host/CLI 构建面的前提下增加 browser-only Client build face，生成 DSH loader artifact `lib/client.js`、`lib/client.d.ts` 与单一插件标记样式注入。

## 改动文件

- `plugin/package.json`
- `plugin/pnpm-lock.yaml`
- `plugin/tsconfig.json`
- `plugin/tsconfig.client.json`
- `plugin/tsdown.config.ts`
- `plugin/src/client/index.ts`
- `plugin/src/client/styles.css`
- `plugin/src/client/css.d.ts`
- `plugin/tests/build/client-bundle.spec.ts`
- `.superpowers/sdd/2026-08-24-03-dsh-vault-client-integration/task-1-report.md`

## RED 证据

先建立 artifact contract test，再运行 focused test。

```bash
pnpm --dir plugin exec vitest run tests/build/client-bundle.spec.ts
```

初始结果：退出码 `1`，`3/3` 失败；`dsh.client` 为 `undefined`，读取 `lib/client.js` 报 `ENOENT`。这确认测试先覆盖 manifest 和缺失 Client artifact。

补充 client declaration 契约后再次运行：`4` tests 中 `1` failed；读取 `lib/client.d.ts` 报 `ENOENT`。

## 最小实现

- `package.json` 精确加入计划指定的 `dsh.client.platform/inject/external/immediately`。
- Node ESM face 继续生成 Host/CLI JavaScript、source maps 与 declarations。
- Browser CJS face 仅编译 `src/client/**`，以 `window.__ModuleLoader__.load` factory 包装并固定输出 `lib/client.js`。
- Lightning CSS 在 bundle 构建时编译 `styles.css`；factory 执行时最多注入一个 `style[data-plugin="@robbin810130/dsh-vault-plugin"]`。
- Cordis、React、DSH runtime/UI shared identities 保持 loader externals，不建立独立 SPA。
- `tsconfig.client.json` 仅覆盖 browser Client，Host TypeScript 面排除 `src/client/**` 与 `tests/client/**`。

## 声明产物问题与解决

CJS declaration pass 继承固定 `entryFileNames: 'client.js'` 时，声明插件先将声明 chunk 映射成错误名称，`emitDtsOnly` 又移除非 declaration chunk，导致 `client.d.ts` 缺失。固定所有 chunk 为 `client.d.ts` 又会造成 JavaScript stub 与真实声明重名，产出空 `client.d.ts` 和真实 `client2.d.ts`。

最终按 declaration chunk 名区分：`.d` chunk 输出 `client.d.ts`，其余 stub 保持 `client.js` 并由 declaration-only 阶段清理。最终只保留正确的 `lib/client.d.ts` 与 `lib/client.d.ts.map`。

## GREEN / 最终验证

| 门禁 | 结果 |
| --- | --- |
| `rtk pnpm --dir plugin run build` | exit 0 |
| `rtk pnpm --dir plugin exec vitest run tests/build/client-bundle.spec.ts` | 1 file / 4 tests passed |
| `rtk pnpm --dir plugin exec tsc -p tsconfig.client.json --noEmit` | exit 0 |
| `rtk pnpm --dir plugin test` | 13 files / 174 tests passed |
| `rtk pnpm --dir plugin exec tsc -p tsconfig.host.json --noEmit` | exit 0 |
| `rtk pnpm --dir plugin pack --dry-run` | exit 0 |
| `rtk git diff --check` | exit 0 |

实际 tarball 检查确认包含 `package/lib/client.js` 与 `package/lib/client.d.ts`，且不包含 `package/src/` 或 `package/tests/`。

## 风险与边界

- 当前 Client entry 仅建立 Task 1 build face；Vault API、store、DSH slots 与 React UI 留给后续任务。
- 后续 Client 代码新增共享运行时 import 时，必须继续与 manifest/module-table external 契约同步，避免重复实例或 loader 无法解析。
- `artifacts/`、`.cache/`、生成的 `plugin/lib/` 均不进入提交；未 merge、push 或 publish。

## Commit

`build(vault): add DSH client bundle`（本报告随该提交提交）
