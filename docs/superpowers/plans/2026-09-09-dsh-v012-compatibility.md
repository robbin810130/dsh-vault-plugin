# DSH v0.1.2-rc.1 Compatibility Implementation Plan

**Goal:** Make DSH Vault load on the installed DSH `0.1.2-rc.1` while preserving its settings, navigation, row-concealment, and guarded-open behavior.

**Architecture:** Migrate the Host settings consumer to the new `ctx.settings.installSection` API and update package contracts to the `0.1.2-rc.1` package family. Rebuild the generic client compatibility seams against the new DSH source, then export a version-pinned patch and validate the actual installed profile.

**Tech Stack:** TypeScript, Cordis, DSH package seams, Vitest, pnpm, Git patch export, local macOS DSH profile.

## Global Constraints

- Do not delete Vault state or alter unrelated DSH plugins.
- Do not claim compatibility from TypeScript/build alone; verify the installed profile loads and serves the web UI.
- Keep the compatibility patch generic and free of Vault-specific policy.
- Preserve fail-closed navigation behavior and existing recovery paths.

### Task 1: Establish RED regression coverage

**Files:**
- Modify: `plugin/tests/host/settings.spec.ts`
- Modify: `plugin/tests/build/client-bundle.spec.ts` if the manifest contract needs coverage

- [x] Add a test proving the settings installer uses the new settings service contract.
- [x] Run the focused test and confirm it fails against the old helper import/contract.

### Task 2: Migrate the plugin Host contract

**Files:**
- Modify: `plugin/src/host/settings.ts`
- Modify: `plugin/package.json`
- Modify: `plugin/pnpm-lock.yaml`

- [x] Replace removed `installSettingsSection` and `settingsNamespace` imports with `ctx.settings.installSection` and the literal namespace.
- [x] Update peer/dev dependency ranges to the installed DSH `0.1.2-rc.1` family.
- [x] Run the focused regression and Host typecheck.

### Task 3: Rebase client compatibility seams

**Files:**
- Create/modify: `compat/dsh-v0.1.2-rc.1/README.md`
- Create/modify: `compat/dsh-v0.1.2-rc.1/0001-plugin-access-seams.patch`
- Modify: `scripts/export-dsh-patch.mjs`
- Modify: repository release metadata as needed

- [x] Inspect the new DSH runtime, workspace, conversation, renderer, and plugin-loader contracts.
- [x] Port only the generic `navigationAccess`, `workspaceRows`, guarded session open, and related slot seams required by the client.
- [x] Export and round-trip-check the patch from the reviewed DSH source.

### Task 4: Verify real installation

- [x] Build and run all plugin tests and typechecks serially.
- [x] Install the rebuilt package into the web profile only after preserving the current profile state.
- [x] Restart DSH, verify no plugin import errors, HTTP 200, and the Vault entry/lock flow.
- [x] Record exact version, commit, test counts, and remaining limitations.
