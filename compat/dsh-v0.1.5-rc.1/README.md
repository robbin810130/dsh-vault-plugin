# DSH 0.1.5-rc.1 / Vault 0.2.6 compatibility

Version-pinned repair. Upstream tag: dsh-v0.1.5-rc.1, commit
183f08e9c6dde7e36cd2318eaee70b0da08fb35e. Patch hash: source.json.
Installing the plugin alone does not install this host patch. Do not apply it
to another DSH version or mix a 0.2.6 plugin with the older host seam.

## Scope

Provides navigationAccess, awaited opening, workspace/session row extensions,
and the denied-conversation slot. Authoritative workspace membership now reaches
the resident content gate, denied slot, rows and search; collapsed workspaces no
longer leave their selected child with a disabled unlock button. Pending/failed
Vault state conceals presentation and blocks the content/composer.

This is a foreground privacy lock, NOT disk encryption or server authorization.
It does not prevent access through developer tools, APIs, or original files.
Full subagent ancestry, right-sidebar, streaming, cross-tab and sleep/wake privacy
coverage remains deferred. Existing user data is not renamed or encrypted.

## Reproduce

1. Check out the exact upstream commit; verify HEAD and source.json patch hash.
2. Run git apply --check with the absolute patch path, then git apply.
3. Install upstream dependencies with its pinned pnpm/lockfile. Copy
   build-vault-client.mts to the upstream root and run pnpm exec tsx
   build-vault-client.mts there. This builds four browser bundles, not a full
   official DSH distribution. Local validation used an existing dependency tree.
4. Run pnpm exec vitest run packages/api/session-controller/tests
   packages/client/ui-workspace/tests packages/client/ui-conversation/tests
   packages/client/ui-layout/tests --reporter=dot.
5. Build/package the candidate plugin from this repository. Copy
   hardening-smoke.mjs to this repository's .cache/dsh-v015 root and run
   node hardening-smoke.mjs from that directory. It is a local macOS harness:
   installed DSH CLI/profile dependencies, Google Chrome, port 3180, and
   plugin/node_modules/playwright are required. It copies the candidate backend
   into a temporary DSH_HOME and intercepts all four candidate host bundles plus
   candidate plugin JS. No real Vault data or model requests are used.
6. The search test deliberately marks a disposable blank session searchable and
   injects a synthetic search snippet at the transport boundary. Vault policy,
   creation, bindings and unlock calls are real. This proves browser concealment,
   not a full content-search backend integration. Temp evidence is retained;
   browser/server close on exit. smoke-vault.mjs is the historical 0.2.4 harness,
   not current candidate-backend proof.

## Validation and remaining boundaries

Current results are in verification.json and the repository delivery record
at docs/diagnostics/2026-09-16-vault-0.2.6-delivery.md. Pristine upstream forward /
reverse application and exact comparison cover all 24 patched files.

Full DSH source typecheck is NOT clean: generated/dependency mismatches remain.
Four bundle builds and targeted host tests are not a clean full-host typecheck.
Local automated Chrome checks are not human visual acceptance or Windows proof.

## Deployment and rollback

Stop ai.deepseek.harness before replacement; confirm no 3080 listener. Back up
the installed plugin, four packages' lib/client.js and .map, profile config and
Vault state with hashes. Replace only the validated plugin and eight host files;
restart one LaunchAgent and compare deployed hashes and a read-only snapshot.
Do not change existing password policy, groups or bindings during acceptance.

The delivery record names the current backup manifest. For rollback: stop the
service, restore plugin and eight host files from that manifest, then bootstrap
the existing LaunchAgent. Do not overwrite current Vault data with the backup
unless an explicit data recovery is intended. Confirm DSH still matches before
rollback. This is not an upgrade utility.

Upgrades can overwrite host bundles. Test normal startup and actual Vault
behavior after upgrading; prepare another pinned patch only if necessary.
Historical preparation/export scripts retain their old-version defaults.
