# Vault 0.2.6 hardening implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans; track each independently testable slice.

**Goal:** Close audit F01–F08 without altering existing protected data or password policy.
**Architecture:** Keep the existing API and UI privacy-lock boundary. Add conservative state ownership, bounded credential verification, stable ephemeral recovery delivery, and fail-closed presentation/access.
**Tech Stack:** TypeScript, React, Vitest, Node filesystem, pinned DSH 0.1.5-rc.1 source.
**Spec:** docs/diagnostics/2026-09-16-vault-audit.md, approved by user.

## Constraints
- Do not rename real projects/sessions, remove protection, reset credentials, or persist plaintext recovery keys.
- Unknown ownership never licenses deleting a live lock. PID reuse and foreign hosts fail closed.
- Host patch remains pinned to upstream 183f08e9c6dde7e36cd2318eaee70b0da08fb35e.
- Deployment and release follow integration tests and isolated browser validation; production data is backed up and hashed.

## Execution slices
- [x] Repository F01: regression with killed child owning lock, live-owner refusal, legacy empty lock refusal, concurrent reclaimers. Publish complete PID/hostname/token owner record atomically; reclaim only confirmed dead local owners through one-winner claim; surface safe diagnostic codes. Ownerless legacy files require stopped-service manual recovery, not TTL guesses.
- [x] Repository F10 adjacent regression: inject post-backup fsync failure at state revision1/backup0; retain both original generations during rollback.
- [x] UI F02/F03/F07: formal React/store regressions from audit probes; independent in-memory recovery delivery surviving row teardown; neutral generated group aliases; locked settings labels concealed; draft password policy, explicit save, pending/error feedback.
- [x] Auth F06/F08: real KDF/barrier regressions, serialize shared group credential checks with bounded admission; capture lock revocation generation before queueing and check before grant issuance.
- [x] Access F04/F05: loading and first-failure provider claims plus blocked state, conservative presentation; authoritative nullable workspace context through pinned search row seam.
- [x] Integration: run node node_modules/vitest/vitest.mjs run and both TypeScript projects from plugin; node --test tests/install-script.test.mjs tests/scripts/*.test.mjs from root. Review all diffs and cross-domain interactions.
- [x] Runtime: rebuild plugin and affected host bundles; isolated temporary DSH_HOME Chrome tests for recovery delivery, policy save, inheritance/search, reload/lock/offline. Back up installed files and state, deploy exact artifacts, restart sole LaunchAgent, compare hashes and read-only live snapshot.
- [x] Release: version0.2.6 manifests, accurate release notes/compatibility boundaries, tag test gate, commit/push/tag/Release, independently download and verify SHA-256. F09 and broader F11–F13 operations remain next phase unless required for this safe release.

Each code slice first adds a failing behavior regression, runs it against baseline, then implements the smallest fix and reruns focused tests. Worker write scopes are disjoint; main owns repository/integration/release. Existing report remains preserved.
