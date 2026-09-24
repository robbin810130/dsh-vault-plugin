# DSH 0.1.7-rc.1 compatibility build

This directory pins the upstream `dsh-v0.1.7-rc.1` source archive by SHA-256 and commit. The compatibility patch adds `sessions.openingAccess`, an async fail-closed gate run before a retained Session requests its opening history. The Vault client registers one gate and supplies the authoritative workspace id from the workspace catalog; missing or failed state checks reject the open.

`build-compat.mjs <output-dir> <source-archive>` verifies the archive, upstream version, target source hashes, and patch hash, applies the patch to a fresh temporary extraction, installs the lockfile, builds host libraries and the four affected browser bundles, then emits a `verification.json` with output hashes. It refuses changed source or patch bytes. The archive URL, upstream commit, source file hashes, and patch hash are in `source.json`.

The session row action is provided through the official `sidebar.workspaces.session.row.action` slot. DSH 0.1.7 has no workspace-row accessory or denied-conversation slot; the compatibility build does not pretend otherwise. This access gate protects browser navigation before history fetch. It is not server authorization and does not encrypt DSH's conversation database.
