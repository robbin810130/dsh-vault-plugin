# DSH v0.1.1-rc.2 Compatibility Patch

This directory contains the reviewed compatibility patch for DeepSeek Harness plugin access seams.

## Upstream

- Repository: `https://github.com/deepseek-ai/deepseek-harness.git`
- Tag: `dsh-v0.1.1-rc.2`
- Pinned commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Reviewed head: `9082f45242df58bde218888d981e97fc34773d06`

The reviewed DSH branch contains eight source commits, grouped into three logical compatibility layers: runtime navigation access, workspace row access, and conversation session gating. The final two commits keep the required typecheck and contracts-ready lint gates clean.

## Changed Packages

- `packages/client/runtime`
- `packages/client/ui-workspace`
- `packages/client/ui-conversation`

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
git diff --binary b150a551b8d465e31e418e1b2eaf5e79bbb7d28e..HEAD -- packages/client/runtime packages/client/ui-workspace packages/client/ui-conversation
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
pnpm vitest run packages/client/runtime/tests packages/client/ui-workspace/tests packages/client/ui-conversation/tests
pnpm run typecheck
pnpm run lint:contracts-ready
```

Run these repository gates after exporting:

```bash
node --test tests/scripts/prepare-dsh-source.test.mjs tests/scripts/export-dsh-patch.test.mjs
git diff --check
```

Any new DSH version requires a fresh compatibility review and a newly exported patch from that reviewed source.
