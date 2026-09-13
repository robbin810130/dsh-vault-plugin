# DSH 0.1.5-rc.1 / Vault 0.2.4 compatibility

Version-pinned local repair, verified 2026-09-13. Upstream tag: dsh-v0.1.5-rc.1, commit 183f08e9c6dde7e36cd2318eaee70b0da08fb35e. Hashes: source.json.

## Scope and boundaries

Restores navigationAccess, awaited session opening, workspace row decoration/accessory/action slots, and the denied-conversation slot. The new resident shell hides header/composer while locked. Document titles and row presentations react to access changes. Original session data is not renamed or encrypted.

This remains a foreground privacy lock, NOT disk encryption or server authorization. It does not prevent access through developer tools, APIs, or original files. Workspace inheritance, search, subagent ancestry and right-sidebar surfaces have not received a complete new-version end-to-end security audit; do not treat this repair as one.

## Reproduce

1. Check out the exact upstream commit above; verify HEAD.
2. Run git apply --check with the absolute patch path, then git apply with that path.
3. Install upstream workspace dependencies with its pinned pnpm/lockfile. Copy build-vault-client.mts to the upstream root and run pnpm exec tsx build-vault-client.mts there. Builds four browser bundles only, not a full official release. Local compilation used an existing dependency tree.
4. Run pnpm exec vitest run packages/api/session-controller/tests packages/client/ui-workspace/tests packages/client/ui-conversation/tests packages/client/ui-layout/tests --reporter=dot.
5. Copy smoke-vault.mjs to this repository's .cache/dsh-v015 root. This local macOS harness uses the installed DSH CLI/profile dependencies and plugin/node_modules/playwright, creates temporary DSH_HOME on port 3180, intercepts four client bundles, seeds disposable Vault data, and checks lock/unlock/reload. It never writes real groups. Temporary evidence directories are retained; its server/browser close on exit.

## Validation

- Pristine official archive: forward/reverse patch application checks passed.
- Host regression: 85 files / 1,407 tests passed.
- Vault regression: 25 files / 261 tests passed.
- Four client bundles built successfully.
- Isolated Chrome: settings, restored locked selection, concealed title, password unlock, live sidebar refresh, restored composer, reload/relock; no console/page errors.
- Formal 3080: authenticated settings and read-only snapshot HTTP 200; no console/page errors. No real passwords, bindings or groups changed.
- Source typecheck attempted, NOT green: source/generated/installed dependency mismatches remain in generated ClientRemoteService members, session stream predicate, file-upload remote interface, permission projections and permission-presets declarations. Tests/builds do not replace a full clean typecheck.

## Deployment and rollback

Only four core packages' lib/client.js and .map replaced. Only Vault re-enabled; dsh-zh and dsh-update-checker remain disabled. Stopped orphan manual 3080 server; restored existing LaunchAgent as sole listener.

Persistent pre-deployment backup:
/Users/Robbin/.dsh/backups/vault-v015-20260913-132524

Its manifest.json maps original backups to installed paths and records deployed hashes. To roll back: bootout the ai.deepseek.harness LaunchAgent, restore each existing manifest backup to its destination, restore backup cordis.patch.yml to ~/.dsh/profiles/web/cordis.patch.yml, then bootstrap ~/Library/LaunchAgents/ai.deepseek.harness.plist. Do not overwrite Vault data. Confirm DSH version still matches before rollback; this is not an upgrade utility.

Updates can overwrite these bundles. Test startup and real Vault behavior after upgrade; make another version-pinned patch only if needed. Existing installer/preparation/export scripts retain prior-release defaults. This directory does not publish a new release or update those defaults.
