# DSH Vault Client and Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser half of DSH Vault, connect it to the Host API and DSH compatibility seams, reproduce the approved V3 experience in native DSH slots, and package an installable private plugin release.

**Architecture:** One client controller owns the redacted Host snapshot, ephemeral client id and grants, modal requests, and activity state. Thin adapters register that controller as a navigation-access provider and Workspace row decorator; React components only render controller state and call typed actions. A root `shell.overlay` entry owns the unlock dialog, `conversation.access.denied` owns the locked page, and `settings.plugin.item` owns the configuration card.

**Tech Stack:** TypeScript 6, React 18, Cordis client services, DSH slots/runtime/theme tokens, native Fetch API, tsdown, Lightning CSS, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`

## Global Constraints

- Complete plans 01 and 02 first; consume their exact public interfaces without duplicating services.
- Target DSH `0.1.1-rc.2` plus `compat/dsh-v0.1.1-rc.2/0001-plugin-access-seams.patch`.
- The final UI must follow DSH theme tokens; do not add an independent light/dark preference.
- Use “已上锁”“内容受保护”; never display “已加密” or imply at-rest encryption.
- Password, recovery key, and grant token live only in short-lived function scope or current-tab memory.
- Never write secrets to Cookie, LocalStorage, SessionStorage, IndexedDB, URL, telemetry, console, or errors.
- Locked real names must not reach rendered DOM, tooltip, ARIA label, or copy text.
- Desktop uses DSH compact density; touch targets are at least `44px` at narrow breakpoints.
- All asynchronous error paths fail closed and preserve a retry or recovery action.
- The client bundle must use DSH's `window.__ModuleLoader__.load` factory format; no standalone SPA is permitted.

---

### Task 1: Client build face and DSH loader artifact

**Files:**
- Modify: `plugin/package.json`
- Modify: `plugin/tsconfig.json`
- Create: `plugin/tsconfig.client.json`
- Create: `plugin/tsdown.config.ts`
- Create: `plugin/src/client/index.ts`
- Create: `plugin/src/client/styles.css`
- Create: `plugin/src/client/css.d.ts`
- Test: `plugin/tests/build/client-bundle.spec.ts`

**Interfaces:**
- Consumes: Host package from plan 02, DSH module-table externals.
- Produces: `plugin/lib/client.js`, client declarations, injected stylesheet, `dsh.client` manifest.

- [ ] **Step 1: Write failing artifact-contract test**

```ts
it('emits a DSH loader factory without unresolved browser imports', async () => {
  const code = await readFile(new URL('../../lib/client.js', import.meta.url), 'utf8')
  expect(code).toContain('window.__ModuleLoader__.load({')
  expect(code).toContain("id: '@robbin810130/dsh-vault-plugin'")
  expect(code).not.toMatch(/^import /m)
})
```

Also assert the bundle contains one tagged style injection and does not inline duplicate Cordis, React, runtime, slots, locale, layout, settings, or UI-primitives identities.

- [ ] **Step 2: Run build test and verify RED**

Run: `pnpm --dir plugin vitest run tests/build/client-bundle.spec.ts`

Expected: FAIL because `lib/client.js` and client config do not exist.

- [ ] **Step 3: Implement the two-face build**

Add `dsh.client` metadata:

```json
{
  "platform": "web",
  "inject": [
    "@deepseek-ai/dsh-client-runtime",
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-ui-layout",
    "@deepseek-ai/dsh-client-ui-settings-plugins",
    "@deepseek-ai/dsh-client-ui-workspace",
    "@deepseek-ai/dsh-client-ui-conversation"
  ],
  "external": [
    "@deepseek-ai/cordis",
    "@deepseek-ai/dsh-client-runtime/client",
    "@deepseek-ai/dsh-client-ui-primitives",
    "react",
    "react/jsx-runtime"
  ],
  "immediately": true
}
```

Configure tsdown to emit the Node half as ESM and the Client half as CJS wrapped by:

```ts
banner: "window.__ModuleLoader__.load({ id: '@robbin810130/dsh-vault-plugin', factory: (require) => {",
intro: 'var module = { exports: {} }; var exports = module.exports;',
footer: 'return module.exports; } });',
```

Add a small tsdown plugin that compiles `styles.css` with Lightning CSS and injects one `<style data-plugin="@robbin810130/dsh-vault-plugin">` at factory execution.

- [ ] **Step 4: Build and verify GREEN**

Run:

```bash
pnpm --dir plugin run build
pnpm --dir plugin vitest run tests/build/client-bundle.spec.ts
pnpm --dir plugin exec tsc -p tsconfig.client.json --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugin/package.json plugin/tsconfig* plugin/tsdown.config.ts plugin/src/client plugin/tests/build
git commit -m "build(vault): add DSH client bundle"
```

---

### Task 2: Typed browser API client and redacted snapshot store

**Files:**
- Create: `plugin/src/client/api.ts`
- Create: `plugin/src/client/store.ts`
- Create: `plugin/src/client/store-types.ts`
- Test: `plugin/tests/client/api.client.spec.ts`
- Test: `plugin/tests/client/store.client.spec.ts`

**Interfaces:**
- Consumes: `VaultApiRequest`, `VaultApiResult`, `VaultSnapshot` from `src/shared/contracts.ts`.
- Produces: `VaultApiClient.call()`, observable `VaultClientStore`, immutable current-tab `clientInstanceId`.

```ts
export interface VaultApiClient {
  call<T>(request: VaultApiRequest, signal?: AbortSignal): Promise<VaultApiResult<T>>
}

export interface VaultClientSnapshot {
  readonly host: 'loading' | 'ready' | 'offline'
  readonly revision: number
  readonly groups: readonly RedactedPasswordGroup[]
  readonly bindings: readonly ProtectionBinding[]
  readonly unlockedGroupIds: ReadonlySet<string>
  readonly prompt: UnlockPromptState | null
}
```

- [ ] **Step 1: Write failing API and store tests**

Test route path, POST JSON, `credentials: 'same-origin'`, no-store request, abort propagation, malformed response refusal, offline transition, immutable snapshots, one UUID per store, no browser-storage calls, and secret removal after request settlement.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir plugin vitest run tests/client/api.client.spec.ts tests/client/store.client.spec.ts`

Expected: FAIL because client and store do not exist.

- [ ] **Step 3: Implement the API and observable store**

Use `fetch('/dsh-vault/api', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body })`. The store exposes `getSnapshot`, `subscribe`, `refresh`, `validateGrants`, `touchActivity`, `unlock`, `lockGroup`, `lockAll`, and group/binding mutation actions. Store `{ token, credentialVersion }` grant proofs in a private `Map<string, GrantProof>` that is never included in snapshots. Refresh reads redacted configuration first, then validates only the proofs currently held by this tab; Host results remove invalid or expired proofs.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --dir plugin vitest run tests/client/api.client.spec.ts tests/client/store.client.spec.ts`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/client/api.ts plugin/src/client/store.ts plugin/src/client/store-types.ts plugin/tests/client
git commit -m "feat(vault): add browser API and state store"
```

---

### Task 3: Navigation provider and locked-name presentation

**Files:**
- Create: `plugin/src/client/access/provider.ts`
- Create: `plugin/src/client/access/resolution.ts`
- Create: `plugin/src/client/rows/presentation.ts`
- Modify: `plugin/src/client/index.ts`
- Test: `plugin/tests/client/access-provider.client.spec.ts`
- Test: `plugin/tests/client/presentation.client.spec.ts`

**Interfaces:**
- Consumes: `NavigationAccessProvider`, `WorkspaceRowDecorator`, `VaultClientStore`.
- Produces: one effect-scoped access provider and one effect-scoped row decorator.

```ts
export function createVaultAccessProvider(store: VaultClientStore): NavigationAccessProvider
export function createVaultRowDecorator(store: VaultClientStore, t: VaultTranslate): WorkspaceRowDecorator
```

- [ ] **Step 1: Write failing access tests**

Test plain target bypass, locked workspace block, inherited session block, direct session override, unlocked group allow, expired group block, Host-offline block, one pending prompt per group, and prompt cancellation returning `{ allow: false, handled: true }`.

Test presentation policies `workspace-visible-session-hidden`, `all-visible`, and `all-hidden`, including removal of snippet, workspace label, detail, copy text, and real ARIA label.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir plugin vitest run tests/client/access-provider.client.spec.ts tests/client/presentation.client.spec.ts`

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement adapters and lifecycle registration**

`requestSession` and `requestWorkspace` call `store.requestUnlock(groupId, target)`, await the modal result, and return allow only after the store records a valid grant. `sessionState` and `workspaceState` are synchronous cache reads. Register both adapters with `ctx.effect` and dispose them on plugin unload.

The client entry declares the Cordis service dependencies explicitly:

```ts
export const inject = ['slots', 'locale', 'settingsScope', 'navigationAccess', 'workspaceRows']
```

- [ ] **Step 4: Run focused tests and client typecheck**

Run:

```bash
pnpm --dir plugin vitest run tests/client/access-provider.client.spec.ts tests/client/presentation.client.spec.ts
pnpm --dir plugin exec tsc -p tsconfig.client.json --noEmit
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/client/access plugin/src/client/rows/presentation.ts plugin/src/client/index.ts plugin/tests/client
git commit -m "feat(vault): guard navigation and conceal locked names"
```

---

### Task 4: Row indicators, action menus, lock page, and unlock dialog

**Files:**
- Create: `plugin/src/client/rows/VaultRowAccessory.tsx`
- Create: `plugin/src/client/rows/VaultRowAction.tsx`
- Create: `plugin/src/client/unlock/UnlockDialog.tsx`
- Create: `plugin/src/client/unlock/LockedConversation.tsx`
- Create: `plugin/src/client/unlock/controller.ts`
- Create: `plugin/src/client/components/LockIcon.tsx`
- Modify: `plugin/src/client/index.ts`
- Modify: `plugin/src/client/styles.css`
- Test: `plugin/tests/client/rows.client.spec.tsx`
- Test: `plugin/tests/client/unlock.client.spec.tsx`

**Interfaces:**
- Consumes: four row slots, `shell.overlay`, `conversation.access.denied`, store prompt actions.
- Produces: accessible lock status, Vault action menu, global modal, denied-content view.

- [ ] **Step 1: Write failing interaction tests**

Test lock icon plus text semantics, independent vs inherited label, row-menu actions, prompt focus, empty-password disabled state, Escape cancellation and focus return, wrong-password preserved input, cooldown countdown, Host offline retry, recovery entry, and successful prompt resolution.

```tsx
it('does not mount real conversation copy while locked', () => {
  render(<LockedConversation sessionId={sid('locked')} store={store} />)
  expect(screen.getByText('需要解锁才能查看内容')).toBeVisible()
  expect(screen.queryByText('secret assistant message')).toBeNull()
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir plugin vitest run tests/client/rows.client.spec.tsx tests/client/unlock.client.spec.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement the approved V3 states in DSH slots**

Register:

```ts
ctx.slots.inject('shell.overlay', () => ctx.slots.register(
  { name: 'shell.overlay', id: 'dsh-vault-unlock', order: 40 },
  UnlockDialog,
))
ctx.slots.inject('conversation.access.denied', () => ctx.slots.register(
  { name: 'conversation.access.denied' },
  LockedConversation,
))
```

Register accessory/action entries for Workspace and Session slots. The action component owns a compact Vault menu instead of modifying DSH's native ellipsis items. Use DSH alias tokens only; all status copy uses “已上锁” and “受保护”.

- [ ] **Step 4: Run component tests**

Run: `pnpm --dir plugin vitest run tests/client/rows.client.spec.tsx tests/client/unlock.client.spec.tsx`

Expected: all PASS with no React act warnings.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/client/rows plugin/src/client/unlock plugin/src/client/components plugin/src/client/index.ts plugin/src/client/styles.css plugin/tests/client
git commit -m "feat(vault): render lock and unlock experience"
```

---

### Task 5: Plugin settings card and password-group workflows

**Files:**
- Create: `plugin/src/client/settings/VaultSettingsCard.tsx`
- Create: `plugin/src/client/settings/PolicyPanel.tsx`
- Create: `plugin/src/client/settings/GroupsPanel.tsx`
- Create: `plugin/src/client/settings/RecoveryPanel.tsx`
- Create: `plugin/src/client/settings/GroupWizard.tsx`
- Create: `plugin/src/client/settings/controller.ts`
- Modify: `plugin/src/client/index.ts`
- Modify: `plugin/src/client/styles.css`
- Test: `plugin/tests/client/settings-card.client.spec.tsx`
- Test: `plugin/tests/client/group-wizard.client.spec.tsx`

**Interfaces:**
- Consumes: DSH `settings.plugin.item`, `ctx.settingsScope.bind({ namespace: 'dsh-vault' })`, Vault API group actions.
- Produces: V3 tabs “锁定策略 / 密码组 / 恢复能力” and revision-safe workflows.

- [ ] **Step 1: Write failing settings-flow tests**

Test policy defaults, failed-attempt toggle with conditional fields, warning when disabled, group creation four-step flow, duplicate-name refusal, member migration confirmation, password confirmation, one-time recovery display, password change, optional recovery rotation, group recovery, group deletion choices, orphan display, revision conflict refresh, and fixed一期 disclosure.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir plugin vitest run tests/client/settings-card.client.spec.tsx tests/client/group-wizard.client.spec.tsx`

Expected: FAIL because the settings UI does not exist.

- [ ] **Step 3: Implement controllers and panels**

Register the keyed card:

```ts
ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'dsh-vault',
    locale: 'settings.dshVault',
    inject: () => controller.inject(),
  }, VaultSettingsCard),
)
```

Use the settings scope only for `VaultPolicy`. Send password, recovery, group membership, and binding mutations through `VaultApiClient`. Clear password fields in `finally` blocks; show a recovery key only from the successful create/recover response and discard it when the one-time screen closes.

- [ ] **Step 4: Run settings tests and accessibility assertions**

Run: `pnpm --dir plugin vitest run tests/client/settings-card.client.spec.tsx tests/client/group-wizard.client.spec.tsx`

Expected: all PASS; no secret appears in serialized store snapshots.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/client/settings plugin/src/client/index.ts plugin/src/client/styles.css plugin/tests/client
git commit -m "feat(vault): add plugin settings workflows"
```

---

### Task 6: Idle timeout, visibility, sleep, and revocation lifecycle

**Files:**
- Create: `plugin/src/client/activity/monitor.ts`
- Create: `plugin/src/client/activity/clock.ts`
- Modify: `plugin/src/client/store.ts`
- Modify: `plugin/src/client/index.ts`
- Test: `plugin/tests/client/activity-monitor.client.spec.ts`

**Interfaces:**
- Consumes: Vault policy, DOM activity events, `visibilitychange`, injected monotonic clock.
- Produces: throttled activity touch, automatic group/all lock, immediate sleep lock.

- [ ] **Step 1: Write failing lifecycle tests**

Test 60-second maximum touch frequency, 15/30/60-minute expiry, `autoLockMinutes=0`, hidden/visible revalidation, timer drift sleep detection, `lockOnSystemSleep=false`, Host disconnect, page unload cleanup, HMR disposal, and no duplicate listeners.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --dir plugin vitest run tests/client/activity-monitor.client.spec.ts`

Expected: FAIL because monitor does not exist.

- [ ] **Step 3: Implement activity monitor**

Listen to `keydown`, `pointerdown`, `touchstart`, `scroll`, `focus`, and `visibilitychange`. Use `{ passive: true }` where legal. Throttled activity calls `store.touchActivity()`, which proves each held grant to the Host. Compare `performance.now()` against the scheduled tick to detect sleep drift; on drift, call `store.lockAll('system-sleep')` when enabled. Register and remove every listener through one `ctx.effect` disposer.

- [ ] **Step 4: Run lifecycle and store tests**

Run: `pnpm --dir plugin vitest run tests/client/activity-monitor.client.spec.ts tests/client/store.client.spec.ts`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/client/activity plugin/src/client/store.ts plugin/src/client/index.ts plugin/tests/client
git commit -m "feat(vault): enforce automatic relocking"
```

---

### Task 7: End-to-end security, accessibility, and visual regression

**Files:**
- Create: `plugin/tests/e2e/fixtures.ts`
- Create: `plugin/tests/e2e/vault-flow.e2e.ts`
- Create: `plugin/tests/e2e/vault-security.e2e.ts`
- Create: `plugin/tests/e2e/vault-visual.e2e.ts`
- Create: `plugin/playwright.config.ts`
- Modify: `plugin/package.json`

**Interfaces:**
- Consumes: patched DSH source checkout, built Host/Client plugin, isolated temporary `DSH_HOME`.
- Produces: browser evidence across real DSH composition.

- [ ] **Step 1: Write failing real-flow tests**

Cover:

```ts
test('direct URL cannot reveal a locked session', async ({ page, dsh }) => {
  const locked = await dsh.seedLockedSession({ title: '机密对话', body: 'secret-body' })
  await page.goto(`${dsh.origin}/session/${locked.id}`)
  await expect(page.getByText('需要解锁才能查看内容')).toBeVisible()
  await expect(page.getByText('secret-body')).toHaveCount(0)
  expect(await page.content()).not.toContain('机密对话')
})
```

Also test project inheritance, direct override, search, recent/restore, Fork, password change, recovery rotation, Host restart, offline retry, remote HTTP refusal, multiple tabs, manual group lock, lock-all, and plugin unload parity.

- [ ] **Step 2: Run targeted E2E and verify RED**

Run: `pnpm --dir plugin playwright test tests/e2e/vault-flow.e2e.ts`

Expected: FAIL until the real patched DSH composition and plugin fixture are wired.

- [ ] **Step 3: Complete the isolated DSH fixture**

The fixture creates a temporary DSH home, installs the plugin checkout into profile `web`, applies the pinned compatibility patch to the prepared source checkout, boots on an OS-assigned loopback port, seeds test Workspace/Session projections, and tears down process plus temp files after every worker.

- [ ] **Step 4: Run complete verification matrix**

Run:

```bash
pnpm --dir plugin run build
pnpm --dir plugin vitest run
pnpm --dir plugin playwright test
pnpm --dir plugin exec tsc -p tsconfig.host.json --noEmit
pnpm --dir plugin exec tsc -p tsconfig.client.json --noEmit
```

Visual cases: DSH light/dark, expanded/collapsed sidebar, 390px viewport, locked, prompting, rejected, cooldown, offline, recovery, unlocked, Chinese long names, English names, and large member counts. Contrast assertions require at least `4.5:1`; narrow touch targets require at least `44px`.

- [ ] **Step 5: Commit**

```bash
git add plugin/tests/e2e plugin/playwright.config.ts plugin/package.json
git commit -m "test(vault): verify DSH privacy lock end to end"
```

---

### Task 8: Package, install, rollback, and release documentation

**Files:**
- Create: `plugin/README.md`
- Create: `plugin/LICENSE`
- Create: `docs/install.md`
- Create: `docs/security-boundary.md`
- Create: `scripts/package-release.mjs`
- Modify: `README.md`
- Modify: `plugin/package.json`
- Test: `tests/scripts/package-release.test.mjs`

**Interfaces:**
- Consumes: green compatibility patch, built plugin, verified private repository.
- Produces: `artifacts/dsh-vault-plugin-0.1.0.tgz`, checksums, installation and rollback instructions.

- [ ] **Step 1: Write failing package-content test**

Assert the tarball contains only declared runtime assets, `cordis.patch.yml`, declarations, README and LICENSE; reject source tests, `.env`, state files, tokens, prototype server state, and absolute local paths.

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/scripts/package-release.test.mjs`

Expected: FAIL because the release script and artifact do not exist.

- [ ] **Step 3: Implement packaging and operator docs**

Document exact install:

```bash
dsh plugin --profile web add ./artifacts/dsh-vault-plugin-0.1.0.tgz
dsh web --dump-config
```

Document applying and reverting the pinned DSH compatibility patch from source, backing up `$DSH_HOME/vault-lock`, uninstalling the plugin, and running the emergency command:

```bash
dsh plugin --profile web exec dsh-vault protection remove --group <group-id>
```

State prominently that一期 does not encrypt Session files.

- [ ] **Step 4: Run final release gate**

Run:

```bash
node scripts/package-release.mjs
node --test tests/scripts/package-release.test.mjs
pnpm --dir plugin vitest run
pnpm --dir plugin playwright test
git diff --check
git status --short
```

Expected: all tests pass, package checksum is printed, diff check is clean, and only the intended artifact/docs changes remain.

- [ ] **Step 5: Commit**

```bash
git add plugin/README.md plugin/LICENSE docs/install.md docs/security-boundary.md scripts/package-release.mjs tests/scripts/package-release.test.mjs README.md plugin/package.json
git commit -m "docs(vault): add install and rollback release guide"
```
