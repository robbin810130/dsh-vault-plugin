# DSH v0.1.1-rc.2 Compatibility Patch

This directory contains the reviewed compatibility patch for DeepSeek Harness plugin access seams.

## Upstream

- Repository: `https://github.com/deepseek-ai/deepseek-harness.git`
- Tag: `dsh-v0.1.1-rc.2`
- Pinned commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Reviewed head: `98d3343b517ec56ccf0261860604dfc7953b6cc8`

The reviewed DSH branch contains five source commits, grouped into three logical compatibility layers plus final review fixes: runtime navigation access, workspace row access, conversation session gating, and compatibility seam hardening. The final commits keep the required typecheck and contracts-ready lint gates clean.

## Changed Packages

- `packages/client/runtime`
- `packages/client/ui-agent-preset`
- `packages/client/ui-sidebar`
- `packages/client/ui-workspace`
- `packages/client/ui-conversation`
- `packages/client/ui-renderer`
- `packages/extensions/cordis-client-runner`
- `packages/test-support/client-runtime`

## Public Contracts

The patch exposes generic compatibility seams only; it contains no Vault, password, credential, or encryption policy.

`ctx.workspaceRows` accepts full presentation decorators. A decorator receives the complete Workspace or Session row presentation and returns the complete replacement presentation. Optional synchronous `matchesWorkspace` / `matchesSession` predicates let a decorator skip unmatched rows with native parity. Matching decorators may also provide `fallbackWorkspace` / `fallbackSession`; matcher, decorator, or fallback failures are caught so unmatched rows keep their base presentation and matched or indeterminate rows fail closed to a concealed generic presentation.

`ctx.navigationAccess` separates synchronous render state from asynchronous user-action requests. `workspaceState` / `sessionState` are local snapshot reads for row rendering and the current conversation access seat. `requestWorkspace` / `requestSession` are awaited before public session opening and sensitive native mutations such as workspace-scoped session create, session fork, session rename, session archive, Workspace rename, and Workspace delete. Matching provider denial or failure blocks the action before any lower-level select/open/RPC side effect; unmatched targets retain native allow behavior.

All public session opening paths converge on the runtime boundary: sidebar rows, search results, restored selections, fork auto-open, subagent/workflow/plugin calls, `sessions.open()`, and `openSubagent()`.

The sessions face exposes truthful guarded-open completion so UI composition and `startSession()` can wait until the target is authorized and selected before applying dependent local state. It does not expose an authorization bypass. Workspace connects single-flight the whole guarded operation. Workspace and Session reorder requests reserve their generation before awaiting access, and stale authorization or unary Host completions cannot overwrite a newer gesture. UI-owned local Session orders use the same generic session access boundary.

Conversation workspace switching awaits that truthful session result before moving draft text or image ids between session-local shells. Deny, provider failure, stale completion, or target removal therefore leaves both shells untouched; allow/no-match performs the existing move once without a second session-access request.

## Export

From this repository:

```bash
node scripts/export-dsh-patch.mjs
```

The script writes:

```text
compat/dsh-v0.1.1-rc.2/0001-plugin-access-seams.patch
```

It is generated from the reviewed DSH checkout with:

```bash
git diff --binary b150a551b8d465e31e418e1b2eaf5e79bbb7d28e..HEAD -- packages/client/runtime packages/client/ui-agent-preset packages/client/ui-sidebar packages/client/ui-workspace packages/client/ui-conversation packages/extensions/cordis-client-runner packages/test-support/client-runtime
```

## Apply

In a clean DSH checkout at the pinned commit:

```bash
git checkout --detach b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
git apply --check /path/to/0001-plugin-access-seams.patch
git apply /path/to/0001-plugin-access-seams.patch
```

## Verification

Run these focused DSH gates after applying the patch:

```bash
pnpm vitest run packages/client/runtime/tests packages/client/ui-workspace/tests packages/client/ui-conversation/tests packages/client/ui-renderer/tests
pnpm run typecheck
pnpm run lint:contracts-ready
```

Run these repository gates after exporting:

```bash
node --test tests/scripts/prepare-dsh-source.test.mjs tests/scripts/export-dsh-patch.test.mjs
git diff --check
```

Any new DSH version requires a fresh compatibility review and a newly exported patch from that reviewed source.
