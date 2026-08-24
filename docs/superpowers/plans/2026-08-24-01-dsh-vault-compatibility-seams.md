# DSH Vault Compatibility Seams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generic, plugin-composable row presentation, row actions, navigation guards, and a denied-conversation seat to DSH without embedding Vault business logic.

**Architecture:** Work against the pinned upstream tag in a disposable source checkout, test the DSH packages in place, then export one reviewable patch into this repository. The runtime owns a generic observable navigation-access registry; ui-workspace owns row presentation and row slots; ui-conversation consults the access registry before rendering the current session.

**Tech Stack:** TypeScript 6, React 18, Cordis services, DSH slot runtime, Vitest 4, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`

## Global Constraints

- Pin upstream DSH to tag `dsh-v0.1.1-rc.2`, commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.
- Require Node `^22.19.0 || >=24.0.0`; the verified local runtime is Node `22.22.2`.
- The compatibility patch must contain no password, Vault, credential, or encryption policy.
- With no provider or row contribution registered, DSH behavior and rendered output must remain unchanged.
- A matching access provider that throws must deny that target; unmatched targets must bypass asynchronous guard work.
- Every Cordis registration, subscription, and service contribution must be effect-scoped and HMR-clean.
- Do not edit the installed package under `~/.workbuddy`; build and test from the pinned source checkout.
- Export the final source delta to `compat/dsh-v0.1.1-rc.2/0001-plugin-access-seams.patch`.

---

### Task 1: Reproducible pinned DSH source checkout

**Files:**
- Modify: `.gitignore`
- Create: `compat/dsh-v0.1.1-rc.2/upstream.json`
- Create: `scripts/prepare-dsh-source.mjs`
- Test: `tests/scripts/prepare-dsh-source.test.mjs`

**Interfaces:**
- Consumes: `gh` CLI authentication and local `git`.
- Produces: `prepareDshSource({ root, run }) -> Promise<string>` returning the verified checkout path.

- [ ] **Step 1: Write the failing pin-validation test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateHead } from '../../scripts/prepare-dsh-source.mjs'

test('accepts only the pinned upstream commit', () => {
  assert.doesNotThrow(() => validateHead('b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'))
  assert.throws(() => validateHead('0000000000000000000000000000000000000000'), /unexpected DSH commit/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/scripts/prepare-dsh-source.test.mjs`

Expected: FAIL because `prepare-dsh-source.mjs` does not exist.

- [ ] **Step 3: Implement the pin manifest and checkout helper**

```json
{
  "repository": "https://github.com/deepseek-ai/deepseek-harness.git",
  "tag": "dsh-v0.1.1-rc.2",
  "commit": "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"
}
```

```js
export const PINNED_COMMIT = 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'

export function validateHead(head) {
  if (head !== PINNED_COMMIT) throw new Error(`unexpected DSH commit: ${head}`)
}
```

The executable path clones tag `dsh-v0.1.1-rc.2` into `.cache/deepseek-harness`, reads `git rev-parse HEAD`, calls `validateHead`, and refuses a dirty or mismatched checkout. Add `.cache/` to `.gitignore`.

- [ ] **Step 4: Run test and checkout verification**

Run: `node --test tests/scripts/prepare-dsh-source.test.mjs`

Run: `node scripts/prepare-dsh-source.mjs`

Expected: PASS and print an absolute checkout path whose HEAD is the pinned commit.

- [ ] **Step 5: Commit**

```bash
git add .gitignore compat/dsh-v0.1.1-rc.2/upstream.json scripts/prepare-dsh-source.mjs tests/scripts/prepare-dsh-source.test.mjs
git commit -m "build: pin DSH compatibility source"
```

---

### Task 2: Generic observable navigation-access registry

**Files:**
- Create in DSH checkout: `packages/client/runtime/src/client/navigation/access.ts`
- Modify in DSH checkout: `packages/client/runtime/src/client/index.ts`
- Modify in DSH checkout: `packages/client/runtime/src/client/contract/session.ts`
- Test in DSH checkout: `packages/client/runtime/tests/navigation-access.client.spec.ts`

**Interfaces:**
- Consumes: `SessionId`, `WorkspaceId`, Cordis `Context.effect`.
- Produces: `ctx.navigationAccess`, `NavigationAccessProvider`, `NavigationAccessState`, `NavigationDecision`.

```ts
export type NavigationAccessState =
  | { readonly kind: 'allow' }
  | { readonly kind: 'blocked'; readonly reason: string }

export interface NavigationDecision {
  readonly allow: boolean
  readonly handled?: boolean
}

export interface NavigationAccessProvider {
  matchesWorkspace(id: WorkspaceId): boolean
  matchesSession(id: SessionId): boolean
  workspaceState(id: WorkspaceId): NavigationAccessState
  sessionState(id: SessionId): NavigationAccessState
  requestWorkspace(id: WorkspaceId): Promise<NavigationDecision>
  requestSession(id: SessionId): Promise<NavigationDecision>
  subscribe(listener: () => void): () => void
}

export interface NavigationAccess {
  register(provider: NavigationAccessProvider): () => void
  workspaceState(id: WorkspaceId): NavigationAccessState
  sessionState(id: SessionId): NavigationAccessState
  requestWorkspace(id: WorkspaceId): Promise<NavigationDecision>
  requestSession(id: SessionId): Promise<NavigationDecision>
  subscribe(listener: () => void): () => void
}
```

- [ ] **Step 1: Write failing registry tests**

Test these exact cases:

```ts
it('bypasses providers that do not match the session', async () => {
  const provider = fakeProvider({ matchesSession: false })
  const registry = new NavigationAccessRegistry()
  expect(await registry.requestSession(sid('plain'))).toEqual({ allow: true })
  expect(provider.requestSession).not.toHaveBeenCalled()
})

it('denies a matching provider failure', async () => {
  const provider = fakeProvider({ matchesSession: true, requestError: new Error('offline') })
  const registry = new NavigationAccessRegistry()
  registry.register(provider)
  await expect(registry.requestSession(sid('locked'))).resolves.toEqual({ allow: false })
})
```

Also test: all matching providers must allow; one denial wins; registration order is stable; subscribe relays provider changes; disposal removes the provider and its listener.

- [ ] **Step 2: Run focused test and verify RED**

Run from DSH checkout:

`pnpm vitest run packages/client/runtime/tests/navigation-access.client.spec.ts`

Expected: FAIL because the registry and context service do not exist.

- [ ] **Step 3: Implement minimal registry and Context merge**

Use an ordered provider array. `workspaceState` and `sessionState` synchronously inspect matching providers and return the first blocked result; no match returns `{ kind: 'allow' }`. Request methods call matching providers sequentially and stop on denial or exception. Register provider subscriptions exactly once and detach them on disposal.

Instantiate the registry in the runtime client `apply(ctx)` and provide it as `navigationAccess`; export all public types from `packages/client/runtime/src/client/index.ts`.

- [ ] **Step 4: Run focused and runtime suites**

Run:

`pnpm vitest run packages/client/runtime/tests/navigation-access.client.spec.ts packages/client/runtime/tests/client-apply.client.spec.ts packages/client/runtime/tests/invariant.client.spec.ts`

Expected: all PASS.

- [ ] **Step 5: Commit in the DSH checkout**

```bash
git add packages/client/runtime/src/client/navigation/access.ts packages/client/runtime/src/client/index.ts packages/client/runtime/src/client/contract/session.ts packages/client/runtime/tests/navigation-access.client.spec.ts
git commit -m "feat(client): add navigation access registry"
```

---

### Task 3: Workspace row presentation and additive row slots

**Files:**
- Create in DSH checkout: `packages/client/ui-workspace/src/client/row-extensions.ts`
- Modify in DSH checkout: `packages/client/ui-workspace/src/client/contract/slots.ts`
- Modify in DSH checkout: `packages/client/ui-workspace/src/client/index.ts`
- Modify in DSH checkout: `packages/client/ui-workspace/src/client/WorkspaceBrowser.tsx`
- Modify in DSH checkout: `packages/client/ui-workspace/src/client/rows/Rows.tsx`
- Modify in DSH checkout: `packages/client/ui-workspace/src/client/rows/Rows.module.css`
- Test in DSH checkout: `packages/client/ui-workspace/tests/row-extensions.client.spec.tsx`
- Test in DSH checkout: `packages/client/ui-workspace/tests/apply.client.spec.ts`
- Test in DSH checkout: `packages/client/ui-workspace/tests/rows.client.spec.tsx`
- Test in DSH checkout: `packages/client/ui-workspace/tests/workspace-browser.client.spec.tsx`

**Interfaces:**
- Consumes: `ctx.navigationAccess`, DSH `renderSlot`, real `WorkspaceId` and `SessionId`.
- Produces: `ctx.workspaceRows`, four row slots, concealed search projection, guarded row activation.

```ts
export interface WorkspaceRowPresentation {
  readonly label: string
  readonly detail?: string
  readonly ariaLabel: string
  readonly concealed: boolean
}

export interface SessionRowPresentation extends WorkspaceRowPresentation {
  readonly workspaceLabel?: string
  readonly snippet?: string
}

export interface WorkspaceRowDecorator {
  workspace(id: WorkspaceId, base: WorkspaceRowPresentation): WorkspaceRowPresentation
  session(id: SessionId, base: SessionRowPresentation): SessionRowPresentation
}

export interface WorkspaceRows {
  register(decorator: WorkspaceRowDecorator): () => void
  workspace(id: WorkspaceId, base: WorkspaceRowPresentation): WorkspaceRowPresentation
  session(id: SessionId, base: SessionRowPresentation): SessionRowPresentation
  subscribe(listener: () => void): () => void
}

export interface WorkspaceRowSlotOwnerProps {
  readonly workspaceId: WorkspaceId
  readonly presentation: WorkspaceRowPresentation
}

export interface SessionRowSlotOwnerProps {
  readonly sessionId: SessionId
  readonly workspaceId?: WorkspaceId
  readonly presentation: SessionRowPresentation
}
```

Declare four root-scoped list slots with owner props carrying only stable ids and the final presentation:

```ts
'sidebar.workspaces.workspace.accessory'
'sidebar.workspaces.workspace.action'
'sidebar.workspaces.session.accessory'
'sidebar.workspaces.session.action'
```

- [ ] **Step 1: Write failing composition tests**

```tsx
it('removes concealed values from visible, hover, copy and aria surfaces', () => {
  const presentation = service.session(sid('s1'), {
    label: 'Real title', workspaceLabel: 'Secret project', snippet: 'secret text',
    ariaLabel: 'Open Real title', concealed: false,
  })
  expect(presentation).toEqual({
    label: '受保护对话', workspaceLabel: undefined, snippet: undefined,
    ariaLabel: '打开受保护对话', concealed: true,
  })
})
```

Test that two decorators compose in registration order, disposal restores the base, all four slots are declared, and row accessory/action entries render for each concrete row without replacing native controls.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

`pnpm vitest run packages/client/ui-workspace/tests/row-extensions.client.spec.tsx packages/client/ui-workspace/tests/apply.client.spec.ts`

Expected: FAIL because `workspaceRows` and row slots do not exist.

- [ ] **Step 3: Implement presentation and guarded activation**

Create one effect-scoped `WorkspaceRowsRegistry`. Add a monotonically increasing `revision` observable to `WorkspaceBrowserInjected.hooks`; the browser subscribes through the framework-generated hook so decorator registration, disposal, or provider updates rerender existing rows. Apply presentation before passing labels, details, snippets, copy text, tooltip text, and ARIA values to row components. Render list-slot accessories beside the title and list-slot actions inside the hover action cluster, passing `WorkspaceRowSlotOwnerProps` or `SessionRowSlotOwnerProps` on every render.

Change row activation to:

```ts
const activateSession = async (id: SessionId): Promise<void> => {
  const decision = await navigationAccess.requestSession(id)
  if (decision.allow) open(id)
}
```

Workspace expansion uses `requestWorkspace`. Search results use the same session presentation and must omit concealed snippets and workspace labels before render.

- [ ] **Step 4: Run the complete ui-workspace suite**

Run:

`pnpm vitest run packages/client/ui-workspace/tests`

Expected: all PASS, including existing drag, rename, search, menu and HMR tests.

- [ ] **Step 5: Commit in the DSH checkout**

```bash
git add packages/client/ui-workspace
git commit -m "feat(ui-workspace): expose composable row access seams"
```

---

### Task 4: Conversation content gate and denied-content slot

**Files:**
- Modify in DSH checkout: `packages/client/ui-conversation/src/client/contract/slots.ts`
- Modify in DSH checkout: `packages/client/ui-conversation/src/client/apply.ts`
- Modify in DSH checkout: `packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx`
- Modify in DSH checkout: `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`
- Test in DSH checkout: `packages/client/ui-conversation/tests/access-gate.client.spec.tsx`
- Test in DSH checkout: `packages/client/ui-conversation/tests/apply-inject.client.spec.tsx`
- Test in DSH checkout: `packages/client/ui-conversation/tests/assembly-surfaces.client.spec.tsx`

**Interfaces:**
- Consumes: `ctx.navigationAccess.sessionState(sessionId)` and its observable subscription.
- Produces: `conversation.access.denied` single session slot; blocked sessions do not mount header, body, composer, or message nodes.

```ts
export interface ConversationAccessDeniedOwnerProps {
  readonly sessionId: SessionId
  readonly reason: string
}
```

- [ ] **Step 1: Write the failing render-boundary test**

```tsx
it('renders only the denied seat for a blocked current session', () => {
  const view = renderConversation({ access: { kind: 'blocked', reason: 'locked' } })
  expect(view.getByTestId('access-denied')).toBeVisible()
  expect(view.queryByTestId('conversation-session')).toBeNull()
  expect(view.queryByRole('textbox')).toBeNull()
})
```

Also test unblock remount, provider disposal, current-session change, and no-provider parity.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

`pnpm vitest run packages/client/ui-conversation/tests/access-gate.client.spec.tsx`

Expected: FAIL because the denied slot is undeclared and the native session still mounts.

- [ ] **Step 3: Implement the access observable and conditional render**

Add `conversation.access.denied` as a child of the resident `conversation` entry. Bind a stable observable source for the current `sessionId`; `ConversationRoot` must render either the denied slot or the native session/header/composer tree, never both. Empty/new-session state remains unchanged.

- [ ] **Step 4: Run conversation and cross-package tests**

Run:

`pnpm vitest run packages/client/ui-conversation/tests packages/client/ui-workspace/tests packages/client/runtime/tests`

Expected: all PASS.

- [ ] **Step 5: Commit in the DSH checkout**

```bash
git add packages/client/ui-conversation
git commit -m "feat(ui-conversation): gate blocked session rendering"
```

---

### Task 5: Export, validate, and document the compatibility patch

**Files:**
- Create: `scripts/export-dsh-patch.mjs`
- Create: `compat/dsh-v0.1.1-rc.2/0001-plugin-access-seams.patch`
- Create: `compat/dsh-v0.1.1-rc.2/README.md`
- Test: `tests/scripts/export-dsh-patch.test.mjs`

**Interfaces:**
- Consumes: verified dirty-free DSH branch containing exactly the three compatibility commits.
- Produces: deterministic patch that applies to the pinned commit and passes focused DSH gates.

- [ ] **Step 1: Write failing patch round-trip test**

The test creates a temporary clone at the pinned commit, runs `git apply --check` on the exported patch, applies it, and asserts these files exist:

```js
const required = [
  'packages/client/runtime/src/client/navigation/access.ts',
  'packages/client/ui-workspace/src/client/row-extensions.ts',
  'packages/client/ui-conversation/tests/access-gate.client.spec.tsx',
]
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/scripts/export-dsh-patch.test.mjs`

Expected: FAIL because no exported patch exists.

- [ ] **Step 3: Implement deterministic export and README**

Export with:

```bash
git diff --binary b150a551b8d465e31e418e1b2eaf5e79bbb7d28e..HEAD -- packages/client/runtime packages/client/ui-workspace packages/client/ui-conversation
```

The script writes the exact stdout to `compat/dsh-v0.1.1-rc.2/0001-plugin-access-seams.patch`. README records the upstream tag/commit, changed packages, application command, verification commands, and the rule that a new DSH version requires a fresh compatibility review.

- [ ] **Step 4: Run final compatibility verification**

Run in the patched DSH checkout:

```bash
pnpm vitest run packages/client/runtime/tests packages/client/ui-workspace/tests packages/client/ui-conversation/tests
pnpm run typecheck
pnpm run lint:contracts-ready
```

Run in this repository:

```bash
node --test tests/scripts/prepare-dsh-source.test.mjs tests/scripts/export-dsh-patch.test.mjs
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the exported compatibility deliverable**

```bash
git add scripts/export-dsh-patch.mjs compat/dsh-v0.1.1-rc.2 tests/scripts/export-dsh-patch.test.mjs
git commit -m "feat: add DSH plugin access compatibility patch"
```
