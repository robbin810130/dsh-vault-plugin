# DSH 0.1.7 Vault Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the local DSH to official `0.1.7-rc.1`, restore Vault compatibility with fail-closed conversation access, and publish the compatible Vault package.

**Architecture:** Migrate the Vault Host settings registration to DSH 0.1.7 config schemas and its browser settings page to `configForms`. Build a version/hash-pinned patch from the exact upstream DSH source to add the client access and workspace-row extension points; test the built bundles and Vault plugin together before installing either locally.

**Tech Stack:** TypeScript, pnpm, Vitest, tsdown, upstream DSH pnpm workspace, Playwright/browser smoke, macOS launchd and app launcher.

**Spec:** `docs/superpowers/specs/2026-09-24-dsh-017-vault-compat-design.md`

## Global Constraints

- Target only official DSH `0.1.7-rc.1` at commit `46a7f68b0922371ce7144b668b90e377d8e799f4`.
- A version or source-hash mismatch must stop patch build/install.
- Preserve Vault keys, bindings, encrypted records, and the on-demand app lifecycle.
- Lock-denied, expired, or failed access checks must not fetch or render protected conversation content.
- Never terminate an unknown process occupying `127.0.0.1:3080`.
- UI access gating is not server authorization or encryption of the DSH database.
- Publish Vault `0.2.8` through the repository's tag-triggered GitHub release workflow only after local and automated acceptance.

## Review Focus

- Deep links, search results, and rapid conversation switching must pass the same access gate before content fetch; cover them in the DSH navigation tests.
- A rejected or timed-out gate must leave no stale transcript visible; assert both data-fetch and render suppression in browser tests.
- Multiple DSH plugin entries must not share Vault policy forms; test distinct config ids and update paths.
- An interrupted or repeated patch install must be idempotent and recoverable; test version/hash refusal and clean rebuild against pristine source.
- Launcher close during startup or after a failed health check must not leave DSH resident; verify cold start, forced close, and repeat start on the actual Mac.

---

### Task 1: Pin and exercise the DSH 0.1.7 patch build

**Files:**
- Create: `compat/dsh-v0.1.7-rc.1/source.json`
- Create: `compat/dsh-v0.1.7-rc.1/verification.json`
- Create: `compat/dsh-v0.1.7-rc.1/build-vault-client.mts`
- Create: `tests/scripts/dsh-v017-compat.test.mjs`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- The build script accepts an unpacked source directory, verifies its version/commit and recorded source hashes, then builds the official browser packages with the Vault compatibility patch.
- The JSON metadata records upstream tag, commit, source archive hash, and patch hash. Release workflow uses this metadata and uploads the patch bundle.

- [ ] Write Node tests that reject wrong version, wrong commit, altered target bundles, and repeated application; run `node --test tests/scripts/dsh-v017-compat.test.mjs` and confirm expected failures.
- [ ] Implement source verification and deterministic clean-build staging under `compat/dsh-v0.1.7-rc.1`; do not write into the downloaded upstream directory.
- [ ] Run the tests and build all affected upstream client bundles from the pristine official source; verify generated artifacts differ only at the reviewed access/settings/workspace sites.
- [ ] Add the new patch bundle and checksum to `.github/workflows/release.yml`; run `git diff --check` and the release asset test suite.

### Task 2: Add and verify DSH client access extension points

**Files:**
- Modify: DSH upstream `packages/client/ui-workspace/src/client/navigation.ts`
- Modify: DSH upstream `packages/client/ui-workspace/src/client/index.ts`
- Modify: affected conversation/session controller client source discovered at the pinned commit
- Create: `compat/dsh-v0.1.7-rc.1/0001-plugin-access-seams.patch`
- Create: upstream browser tests alongside the modified DSH packages, carried as patch content
- Modify: `compat/dsh-v0.1.7-rc.1/README.md`

**Interfaces:**
- Navigation access gate is awaited before any session content request and receives the target session id plus navigation origin.
- Workspace-row contributions are registered/disposed with the owning plugin and expose only row identity/state/actions, not conversation content.
- The generated patch applies only to the pinned source snapshot from Task 1.

- [ ] Add upstream regression tests for list open, direct/deep-link open, search result open, and quick session switch. Assert denied/error/timeout causes no content fetch and clears any prior transcript.
- [ ] Run each new upstream test against unpatched DSH and confirm it fails because the extension gate is absent.
- [ ] Add the smallest navigation and row seams in a temporary clean checkout of the pinned upstream; await the gate before loading content and clear current content on denial.
- [ ] Add tests for allow, deny, throw, timeout, unmount/dispose, and row contributor cleanup; run the affected upstream package test commands.
- [ ] Generate the committed patch from the pristine pinned source, rebuild client bundles, and run the source/version/hash refusal tests from Task 1.

### Task 3: Migrate Vault Host policy registration to DSH 0.1.7

**Files:**
- Modify: `plugin/src/config.ts`
- Modify: `plugin/src/index.ts`
- Modify: `plugin/src/host/settings.ts`
- Modify: `plugin/tests/config.spec.ts`
- Modify: `plugin/tests/host/settings.spec.ts`

**Interfaces:**
- Export the DSH 0.1.7-compatible Vault plugin config schema, including policy fields currently managed by the old settings section.
- Host applies the validated config to `VaultService` without persisting password or transient unlock material.
- State-directory resolution and vault-state storage path remain compatible with existing installations.

- [ ] Add failing tests showing policy fields are accepted through the plugin config schema, defaults match current behavior, and config changes update `VaultService`.
- [ ] Verify old `settings.installSection` registration is rejected by the DSH 0.1.7 host type/API fixture.
- [ ] Migrate `apply()` and policy controller to the 0.1.7 config input; preserve `stateDir` migration behavior and ensure no secret/unlock fields are part of the schema.
- [ ] Run `pnpm --dir plugin exec vitest run tests/config.spec.ts tests/host/settings.spec.ts` and both host/client typechecks.

### Task 4: Migrate Vault client settings and access/row registrations

**Files:**
- Modify: `plugin/src/client/index.ts`
- Modify: `plugin/src/client/settings/VaultSettingsCard.tsx`
- Modify: `plugin/src/client/settings/controller.ts`
- Modify: `plugin/src/client/rows/VaultRowAccessory.tsx`
- Modify: `plugin/src/client/rows/VaultRowAction.tsx`
- Modify: `plugin/tests/client/settings-card.client.spec.tsx`
- Modify: `plugin/tests/client/rows.client.spec.tsx`
- Modify: relevant tests under `plugin/tests/client/access-provider.client.spec.ts` and `plugin/tests/client/unlock.client.spec.tsx`

**Interfaces:**
- Client injects DSH 0.1.7 `slots` and `configForms`; the settings item is served only while the Vault config namespace exists.
- Vault config changes are saved through the selected entry's config form and reflected in the service-backed snapshot.
- Access checks and row actions use the DSH 0.1.7 extension seams added in Task 2; denial remains fail-closed.

- [ ] Add failing UI tests for a served/unserved settings page, per-entry settings forms, save/reload, row visibility, and access rejection with no transcript flash.
- [ ] Migrate slot registration and config-form binding to upstream `configForms.whileServed`/`get` conventions.
- [ ] Wire Vault lock/unlock actions into 0.1.7 navigation/row APIs, disposing every registration on plugin unload or config unserved.
- [ ] Run focused tests for settings, rows, access, unlock, privacy readiness, and frontend hardening; run client typecheck and build.

### Task 5: Full regression, package, and release preparation

**Files:**
- Modify: root `package.json`
- Modify: `plugin/package.json`
- Modify: release workflow and compatibility documentation/assets
- Create: `docs/releases/v0.2.8.md`
- Modify: plugin README and `compat/dsh-v0.1.7-rc.1/README.md`

- [ ] Set package version metadata to `0.2.8`, document DSH version pin and local UI privacy boundary, and retain compatibility assets for prior supported DSH versions.
- [ ] Run all Vault tests (`pnpm --dir plugin test`), host/client typechecks, build, package-release verifier, install-script tests, and DSH 0.1.7 upstream tests.
- [ ] Build and inspect the npm tarball; verify package metadata, bundled client, compatibility patch, and SHA-256 manifest.
- [ ] Run browser acceptance against the rebuilt DSH and Vault bundle for auth, policy editing, lock/deny, unlock, search/open, reload, and rapid switching; save the test record and artifact hashes.

### Task 6: Upgrade and accept on the local Mac

**Files:**
- Local-only: `/opt/homebrew/lib/node_modules/@deepseek-ai/dsh`
- Local-only: `/Users/Robbin/.dsh` profile and plugin state
- Local-only: `/Users/Robbin/Library/Application Support/DSH Launcher`

- [ ] Capture fresh DSH version, profile/plugin inventory, launcher/guardian state, current listener owner, and backup hash; stop if 3080 belongs to an unrelated process.
- [ ] Save a new timestamped backup of `.dsh` and DSH installation metadata; install official `0.1.7-rc.1`, then apply only the version/hash-verified patched browser bundles.
- [ ] Install candidate Vault `0.2.8` without resetting its state; open DeepSeek Harness.app and verify authenticated readiness and real UI behaviors from Task 5.
- [ ] Close the app normally and forcibly; verify guardian, DSH process, and listener exit, then reopen and repeat the health check. Confirm LaunchAgent remains disabled and idle state has no DSH listener.
- [ ] If any acceptance check fails, restore the official DSH package/profile from the new backup, keep the backup and logs, and report the exact failure rather than killing unknown listeners.

### Task 7: Publish and verify Vault `0.2.8`

**Files:**
- Create: Git tag `v0.2.8`
- Publish: GitHub release assets via `.github/workflows/release.yml`

- [ ] Confirm clean tests, typechecks, browser report, local DSH version, Vault plugin version, patch SHA-256, and launcher lifecycle record.
- [ ] Push the reviewed commit and `v0.2.8` tag to the configured GitHub repository to trigger the release workflow.
- [ ] Verify GitHub release assets/checksums and published package contents, then verify the local profile reports Vault `0.2.8` under DSH `0.1.7-rc.1`.
