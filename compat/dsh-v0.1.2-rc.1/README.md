# DSH v0.1.2-rc.1 compatibility patch

This patch restores the extension seams required by `@robbin810130/dsh-vault-plugin`:

- `navigationAccess` registry and guarded `sessions.openAndWait()`;
- composable Workspace row presentations and accessory/action slots;
- the session-scoped `conversation.access.denied` slot, which prevents protected content from rendering while locked.

Apply it to the exact upstream commit recorded in `upstream.json`, then build DSH from source. The patch is intentionally limited to the three listed packages.

```sh
git apply compat/dsh-v0.1.2-rc.1/0001-plugin-access-seams.patch
pnpm install
pnpm build
```

The Vault plugin itself must be installed after the patched DSH packages are built.
