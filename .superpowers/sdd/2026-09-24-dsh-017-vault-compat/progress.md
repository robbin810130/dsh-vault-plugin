# SDD ledger — plan: docs/superpowers/plans/2026-09-24-dsh-017-vault-compat.md

## Setup

- Workspace: isolated Codex worktree `/Users/Robbin/.codex/worktrees/vault-017-compat/DSH 插件`.
- Starting commits: specification `6fa93ef`, plan `0ec42a9`.
- Initial status: clean detached HEAD; root checkout remains on `main` at `813ad06`.
- Pre-flight: repository release workflow pins a different old upstream commit for DSH patch tests; it must be updated only after exact 0.1.7 source/patch verification exists. The four-bundle builder in v0.1.5 is reusable as a pattern but not as a patch. Existing test baseline: plugin 362 tests passed in root checkout before implementation.

## Rulings

- Ruling: keep DSH upstream source scratch in `/tmp/dsh-v0.1.7-rc.1-source` and commit only a reproducible version/hash-pinned patch and build script — avoids vendoring the full upstream repository; cost if wrong: CI must fetch the pinned source to reproduce builds.
- Ruling: treat this as a whole Mac integration task; do not install or publish until the DSH patch, Vault tests, and local-browser acceptance pass — protects the currently preserved profile and the 3080 owner boundary; cost if wrong: longer delivery time.
- Ruling: pnpm 12 requires explicit `minimumReleaseAgeExclude` entries for the exact DSH 0.1.7 prerelease packages in this lockfile — kept the generated version-specific allowlist rather than disabling the age policy globally; cost if wrong: extra workspace metadata to prune when the prerelease ages past the cutoff.

## Tasks

- Task 1: complete. Added the pinned 0.1.7-rc.1 source manifest, refusal checks, reproducible clean-source builder, compatibility patch, generated bundle verification record, and release assets.
- Task 2: complete. Patched DSH's session-opening gate so denial happens before history fetch; upstream controller tests and clean-build output checks pass.
- Task 3: complete. Migrated host policy registration to DSH 0.1.7 config schema and reload events while preserving old setting keys and state location.
- Task 4: complete. Migrated the client to DSH 0.1.7 settings forms and session hooks; Vault plugin is visible and running in the actual upgraded app.
- Task 5: complete for build/test/package gates. `pnpm --dir plugin test` (364), host/client typechecks, plugin build, release verifier, package generation, and installer/release-script tests (16) passed. Tarball SHA-256: `fd8eb65b1ecd8089a4b7bd1fbad48e0c0db73b6fc6338663b4c1522f6cebd7ec`.
- Task 6: complete for local app acceptance. Installed official DSH `0.1.7-rc.1` and Vault `0.2.8`; verified authenticated launch, workspace/session UI, Vault settings and preserved policy values, normal quit/reopen, forced launcher and Chrome App exits, occupied-port refusal, code signature, and final idle state. LaunchAgent remains disabled. The UI reports one unrelated global plugin (`dsh-tabbit`) failed; its detailed cause was not exposed by the plugin UI and it is left unchanged.
- Task 7: in progress. Current `v0.2.8` tag points at `9fbd65e`. All CI tests and full patch application passed. Run `36021471161` confirmed deterministic path normalization: emitted JS now has `/dsh-source/...`, no random staging directory, while all four sourcemaps and API JS match their prior baseline hashes. Updated the three UI JS hashes from that clean CI build. Focused verifier tests pass 6/6. Remaining: run the release workflow again to confirm a fresh build matches these hashes, then verify published assets and idle launcher state.
