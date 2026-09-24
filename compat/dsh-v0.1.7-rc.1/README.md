# DSH 0.1.7-rc.1 compatibility build

This directory pins upstream `dsh-v0.1.7-rc.1` by its immutable commit and hashes of every modified source file. The compatibility patch adds `sessions.openingAccess`, an async fail-closed gate run before a retained Session requests its opening history. The Vault client registers one gate and supplies the authoritative workspace id from the workspace catalog; missing or failed state checks reject the open.

`build-compat.mjs <output-dir> <source-archive>` unpacks the source into a fresh temporary tree, verifies its complete Git tree against the tree of the pinned upstream commit, then checks the version and every modified source preimage. It installs the lockfile, builds host libraries and the four affected browser bundles, and requires their hashes to match this directory's committed `verification.json`. It also verifies the compatibility patch hash. Archive compression metadata is not treated as source identity.

The session row action is provided through the official `sidebar.workspaces.session.row.action` slot. DSH 0.1.7 has no workspace-row accessory or denied-conversation slot; the compatibility build does not pretend otherwise. This access gate protects browser navigation before history fetch. It is not server authorization and does not encrypt DSH's conversation database.
