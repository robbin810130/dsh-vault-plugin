# DSH Vault Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the installable Host half of the DSH Vault plugin: durable policy and binding state, password verification, recovery, rate limiting, short-lived grants, a secure same-origin API, and a local emergency command.

**Architecture:** The Host plugin is a standalone ESM package under `plugin/`. Pure domain modules own crypto, bindings, grants, and persistence; `VaultService` orchestrates them; one exact WebServer route exposes a small validated JSON API. DSH Settings stores only non-sensitive policy, while verifier and binding state live in an atomic private file.

**Tech Stack:** Node.js crypto/fs standard libraries, TypeScript 6, Cordis, Schemastery, DSH WebServer and Settings, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-24-dsh-vault-privacy-lock-design.md`

## Global Constraints

- Target DSH `0.1.1-rc.2` and Node `^22.19.0 || >=24.0.0`.
- Use standard `node:crypto`; add no password-hashing dependency.
- Use scrypt `N=32768`, `r=8`, `p=1`, `keyLength=32`, `maxmem=64 MiB`, with a random 16-byte salt.
- Password input is exact UTF-8: no trimming or normalization; minimum 8 characters, maximum 512 UTF-8 bytes.
- Never persist or log plaintext passwords, recovery keys, or grant tokens.
- Persist `state.json` and `audit.jsonl` under `$DSH_HOME/vault-lock` with directory mode `0700` and file mode `0600`.
- Sensitive API operations require same-origin localhost HTTP or same-origin HTTPS; remote plain HTTP is refused.
- Unknown state, corrupt state, persistence failure, or Host error must fail closed.
- Host modules must contain no React, DOM, or client rendering code.
- Because DSH `0.1.1-rc.2` does not expose top-level CLI extension registration to profile plugins, the supported emergency invocation is `dsh plugin --profile web exec dsh-vault protection remove --group <group-id>`; the installed binary itself is `dsh-vault`.

---

### Task 1: Standalone Host package and shared wire contracts

**Files:**
- Create: `plugin/package.json`
- Create: `plugin/tsconfig.json`
- Create: `plugin/tsconfig.host.json`
- Create: `plugin/tsdown.config.ts`
- Create: `plugin/src/config.ts`
- Create: `plugin/src/shared/contracts.ts`
- Create: `plugin/src/index.ts`
- Create: `plugin/cordis.patch.yml`
- Test: `plugin/tests/config.spec.ts`

**Interfaces:**
- Consumes: DSH plugin loader, `$DSH_HOME`, optional `Config.stateDir`.
- Produces: `Config`, `VaultPolicy`, API request/response unions, empty-but-loadable Host plugin entry.

```ts
export interface Config {
  readonly stateDir?: string
}

export interface VaultPolicy {
  readonly autoLockMinutes: 15 | 30 | 60 | 0
  readonly lockOnSystemSleep: boolean
  readonly lockedNameVisibility: 'workspace-visible-session-hidden' | 'all-visible' | 'all-hidden'
  readonly failedAttemptProtection: {
    readonly enabled: boolean
    readonly maxAttempts: number
    readonly cooldownSeconds: number
  }
}

export type VaultTarget =
  | { readonly type: 'workspace'; readonly id: string }
  | { readonly type: 'session'; readonly id: string; readonly workspaceId?: string }

export interface ProtectionBinding {
  readonly targetType: 'workspace' | 'session'
  readonly targetId: string
  readonly mode: 'direct' | 'inherit' | 'no-inherit'
  readonly passwordGroupId?: string
  readonly workspaceId?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface RedactedPasswordGroup {
  readonly id: string
  readonly name: string
  readonly credentialVersion: number
  readonly recoveryConfigured: boolean
  readonly recoveryGeneratedAt: string
  readonly recoveryLastVerifiedAt?: string
  readonly memberCount: number
}

export interface VaultSnapshot {
  readonly revision: number
  readonly policy: VaultPolicy
  readonly groups: readonly RedactedPasswordGroup[]
  readonly bindings: readonly ProtectionBinding[]
}

export interface GrantProof {
  readonly groupId: string
  readonly credentialVersion: number
  readonly token: string
}

export interface CreateGroupInput {
  readonly name: string
  readonly password: string
  readonly bindings: readonly ProtectionBinding[]
}

export interface ChangePasswordInput {
  readonly groupId: string
  readonly currentPassword?: string
  readonly recoveryKey?: string
  readonly newPassword: string
  readonly rotateRecovery: boolean
}

export interface RecoverGroupInput {
  readonly groupId: string
  readonly recoveryKey: string
  readonly newPassword: string
}

export type BindingMutation =
  | { readonly kind: 'replace'; readonly binding: ProtectionBinding }
  | { readonly kind: 'remove'; readonly targetType: 'workspace' | 'session'; readonly targetId: string }
  | { readonly kind: 'delete-group'; readonly groupId: string; readonly moveToGroupId?: string; readonly removeProtection?: true }
```

- [ ] **Step 1: Write failing schema tests**

```ts
it('normalizes the documented policy defaults', () => {
  expect(VaultPolicySchema({})).toEqual({
    autoLockMinutes: 15,
    lockOnSystemSleep: true,
    lockedNameVisibility: 'workspace-visible-session-hidden',
    failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 },
  })
})
```

Also reject `maxAttempts < 1`, `cooldownSeconds < 1`, unknown auto-lock values, and non-absolute explicit `stateDir`.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --dir plugin vitest run tests/config.spec.ts`

Expected: FAIL because schemas and package scripts do not exist.

- [ ] **Step 3: Create the package and schemas**

Use package name `@robbin810130/dsh-vault-plugin`, version `0.1.0`, ESM, and exports for `.`, `./client`, and `./shared`. Declare a `dsh.bundle.patch` pointing to `cordis.patch.yml`; the patch inserts one loader row named `@robbin810130/dsh-vault-plugin` with id `dsh-vault`.

Set peer dependencies to the exact `0.1.1-rc.2` DSH family and `@deepseek-ai/cordis`. Add `vitest`, `typescript`, `tsx`, and `tsdown` as dev dependencies. The initial `tsdown.config.ts` emits `src/index.ts` and `src/cli.ts` as Node ESM into `lib/`; plan 03 expands the same config with the browser bundle.

- [ ] **Step 4: Install and verify the Host skeleton**

Run:

```bash
pnpm --dir plugin install
pnpm --dir plugin vitest run tests/config.spec.ts
pnpm --dir plugin exec tsc -p tsconfig.host.json --noEmit
pnpm --dir plugin run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugin
git commit -m "build(vault): scaffold host plugin package"
```

---

### Task 2: Password and recovery verifier

**Files:**
- Create: `plugin/src/host/crypto/verifier.ts`
- Test: `plugin/tests/host/verifier.spec.ts`

**Interfaces:**
- Consumes: exact password or recovery-key string.
- Produces: `createVerifier(secret)`, `verifySecret(secret, record)`, `generateRecoveryKey()`.

```ts
export interface SecretVerifier {
  readonly salt: string
  readonly verifier: string
  readonly kdf: 'scrypt'
  readonly parameters: { readonly cost: 32768; readonly blockSize: 8; readonly parallelization: 1; readonly keyLength: 32 }
}

export function createVerifier(secret: string): Promise<SecretVerifier>
export function verifySecret(secret: string, record: SecretVerifier): Promise<boolean>
export function generateRecoveryKey(): string
```

- [ ] **Step 1: Write failing verifier tests**

Test correct secret, wrong secret, unique salts, exact whitespace preservation, UTF-8 size limit, recovery-key format, malformed base64 refusal, and timing-safe comparison invocation.

```ts
it('does not trim password input', async () => {
  const record = await createVerifier('  eight chars  ')
  await expect(verifySecret('eight chars', record)).resolves.toBe(false)
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --dir plugin vitest run tests/host/verifier.spec.ts`

Expected: FAIL because verifier functions do not exist.

- [ ] **Step 3: Implement async scrypt and constant-time comparison**

Wrap `crypto.scrypt` in a Promise, decode persisted values before comparison, require equal derived lengths, and call `timingSafeEqual`. Generate recovery keys from 32 random bytes, formatted into uppercase base32 groups for human transcription; parsing removes ASCII hyphens only and rejects all other format changes.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --dir plugin vitest run tests/host/verifier.spec.ts`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/host/crypto/verifier.ts plugin/tests/host/verifier.spec.ts
git commit -m "feat(vault): add password and recovery verification"
```

---

### Task 3: Atomic private-state repository

**Files:**
- Create: `plugin/src/host/state/model.ts`
- Create: `plugin/src/host/state/schema.ts`
- Create: `plugin/src/host/state/repository.ts`
- Test: `plugin/tests/host/state-repository.spec.ts`

**Interfaces:**
- Consumes: absolute state directory and immutable `VaultState`.
- Produces: `VaultStateRepository.load()`, `commit(expectedRevision, next)`, `appendAudit(event)`.

```ts
export interface VaultState {
  readonly schemaVersion: 1
  readonly revision: number
  readonly groups: Readonly<Record<string, PasswordGroup>>
  readonly bindings: readonly ProtectionBinding[]
}

export interface PasswordGroup {
  readonly id: string
  readonly name: string
  readonly password: SecretVerifier
  readonly recovery: SecretVerifier & {
    readonly generatedAt: string
    readonly lastVerifiedAt?: string
  }
  readonly credentialVersion: number
  readonly createdAt: string
  readonly updatedAt: string
}

export type CommitResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly code: 'revision-conflict' }
```

- [ ] **Step 1: Write failing persistence tests**

Test first-load empty state, `0700`/`0600` modes, revision conflict, temp-file cleanup, atomic replacement, retained `.bak`, corrupt JSON refusal, unsupported schema refusal, and sanitized audit lines.

```ts
it('keeps the previous state when rename fails', async () => {
  const fs = faultingFs({ rename: new Error('disk full') })
  const repo = new VaultStateRepository(dir, fs)
  await expect(repo.commit(0, stateAt(1))).rejects.toThrow('disk full')
  await expect(readStateFile(dir)).resolves.toEqual(stateAt(0))
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --dir plugin vitest run tests/host/state-repository.spec.ts`

Expected: FAIL because repository files do not exist.

- [ ] **Step 3: Implement atomic commit**

Sequence: create directory, write same-directory temp file with `wx` and mode `0600`, `FileHandle.sync()`, copy current state to `.bak` when present, rename temp to `state.json`, open and sync the directory, update in-memory revision. Never replace the in-memory snapshot before durable commit succeeds.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --dir plugin vitest run tests/host/state-repository.spec.ts`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/host/state plugin/tests/host/state-repository.spec.ts
git commit -m "feat(vault): persist private state atomically"
```

---

### Task 4: Binding and inheritance resolver

**Files:**
- Create: `plugin/src/host/bindings/resolver.ts`
- Create: `plugin/src/host/bindings/mutations.ts`
- Test: `plugin/tests/host/bindings.spec.ts`

**Interfaces:**
- Consumes: Workspace/Session identity projection plus `ProtectionBinding[]`.
- Produces: deterministic effective protection and validated mutations.

```ts
export type EffectiveProtection =
  | { readonly protected: false }
  | { readonly protected: true; readonly groupId: string; readonly source: 'workspace' | 'session' }

export function resolveSessionProtection(
  sessionId: string,
  workspaceId: string | undefined,
  bindings: readonly ProtectionBinding[],
): EffectiveProtection
```

- [ ] **Step 1: Write failing precedence tests**

Cover direct session binding, `no-inherit`, workspace inheritance, plain session, moved inherited session, moved direct session, missing group refusal, group deletion with members, migration, archived session retention, and soft-orphan restoration.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --dir plugin vitest run tests/host/bindings.spec.ts`

Expected: FAIL because resolver and mutation functions do not exist.

- [ ] **Step 3: Implement pure resolver and mutation guards**

Use stable ids only. Require group deletion to receive either `moveToGroupId` or `removeProtection: true`; reject ambiguous or partial mutations. Removing a Workspace binding removes only that binding, never direct Session bindings.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --dir plugin vitest run tests/host/bindings.spec.ts`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/host/bindings plugin/tests/host/bindings.spec.ts
git commit -m "feat(vault): resolve project and session protection"
```

---

### Task 5: Grants and configurable failed-attempt protection

**Files:**
- Create: `plugin/src/host/auth/grants.ts`
- Create: `plugin/src/host/auth/attempts.ts`
- Test: `plugin/tests/host/grants.spec.ts`
- Test: `plugin/tests/host/attempts.spec.ts`

**Interfaces:**
- Consumes: group id, credential version, client instance id, policy, monotonic clock.
- Produces: one-time raw grants, hashed Host records, configurable cooldown decisions.

```ts
export interface UnlockGrant {
  readonly token: string
  readonly groupId: string
  readonly credentialVersion: number
  readonly clientInstanceId: string
  readonly issuedAt: number
  readonly expiresAt: number
}

export interface GrantStore {
  issue(groupId: string, credentialVersion: number, clientInstanceId: string, ttlMs: number): UnlockGrant
  authorize(token: string, groupId: string, credentialVersion: number, clientInstanceId: string): boolean
  revokeGroup(groupId: string): void
  revokeClient(clientInstanceId: string): void
  clear(): void
}
```

- [ ] **Step 1: Write failing auth-state tests**

Test token hashing, group/client/version binding, expiry, group revocation, client revocation, Host restart semantics, disabled protection, configurable threshold, cooldown expiry, success reset, and group/client isolation.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir plugin vitest run tests/host/grants.spec.ts tests/host/attempts.spec.ts`

Expected: FAIL because grant and attempt stores do not exist.

- [ ] **Step 3: Implement with injected clocks and randomness**

Use `performance.now()` for process-local deadlines and `Date.now()` only for display timestamps. Store SHA-256 token digests; never store raw token. When failure protection is disabled, return an ordinary rejection with no counter mutation.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --dir plugin vitest run tests/host/grants.spec.ts tests/host/attempts.spec.ts`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/host/auth plugin/tests/host/grants.spec.ts plugin/tests/host/attempts.spec.ts
git commit -m "feat(vault): issue grants and enforce attempt policy"
```

---

### Task 6: Vault service and secure JSON API route

**Files:**
- Create: `plugin/src/host/service.ts`
- Create: `plugin/src/host/api/request.ts`
- Create: `plugin/src/host/api/handler.ts`
- Modify: `plugin/src/shared/contracts.ts`
- Modify: `plugin/src/index.ts`
- Test: `plugin/tests/host/service.spec.ts`
- Test: `plugin/tests/host/api-handler.spec.ts`

**Interfaces:**
- Consumes: repository, verifier, bindings, grants, attempt policy, `ctx.webServer`.
- Produces: `ctx.vault`, exact route `/dsh-vault/api`, JSON-safe redacted snapshots.

```ts
export type VaultApiRequest =
  | { readonly action: 'snapshot'; readonly clientInstanceId: string }
  | { readonly action: 'unlock'; readonly clientInstanceId: string; readonly groupId: string; readonly password: string }
  | { readonly action: 'grants-validate'; readonly clientInstanceId: string; readonly grants: readonly GrantProof[] }
  | { readonly action: 'activity-touch'; readonly clientInstanceId: string; readonly grants: readonly GrantProof[] }
  | { readonly action: 'lock-group'; readonly clientInstanceId: string; readonly groupId: string }
  | { readonly action: 'lock-all'; readonly clientInstanceId: string }
  | { readonly action: 'group-create'; readonly expectedRevision: number; readonly input: CreateGroupInput }
  | { readonly action: 'group-change-password'; readonly expectedRevision: number; readonly input: ChangePasswordInput }
  | { readonly action: 'group-recover'; readonly expectedRevision: number; readonly input: RecoverGroupInput }
  | { readonly action: 'bindings-update'; readonly expectedRevision: number; readonly input: BindingMutation }

export type VaultApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly retryAt?: number } }
```

Successful create and recovery operations return the newly redacted snapshot plus the one-time key; unlock returns one grant proof:

```ts
export interface RecoveryKeyResult {
  readonly snapshot: VaultSnapshot
  readonly recoveryKey: string
}

export interface UnlockResult {
  readonly grant: GrantProof
  readonly expiresAt: number
}
```

- [ ] **Step 1: Write failing service and transport tests**

Test unlock success/error/cooldown, proof-based grant validation, throttled activity touch, no grant before durable create/change/recover commit, redacted snapshot, revision conflict, body limit `256 KiB`, JSON content type, same-origin localhost HTTP, same-origin HTTPS, remote HTTP refusal, mismatched Origin refusal, `Cache-Control: no-store`, and sanitized error bodies.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir plugin vitest run tests/host/service.spec.ts tests/host/api-handler.spec.ts`

Expected: FAIL because service and route do not exist.

- [ ] **Step 3: Implement orchestration and route lifecycle**

`VaultService` is the only module allowed to combine persistence and auth state. Register the exact route through `ctx.effect(() => ctx.webServer.register(...))`. The handler must reject non-POST requests, require `application/json`, stream at most `256 KiB`, validate the request union, and always send `Cache-Control: no-store` plus `Content-Type: application/json; charset=utf-8`.

- [ ] **Step 4: Run Host suite and typecheck**

Run:

```bash
pnpm --dir plugin vitest run tests/host
pnpm --dir plugin exec tsc -p tsconfig.host.json --noEmit
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/index.ts plugin/src/shared/contracts.ts plugin/src/host/service.ts plugin/src/host/api plugin/tests/host
git commit -m "feat(vault): expose secure host API"
```

---

### Task 7: DSH Settings policy and local emergency command

**Files:**
- Create: `plugin/src/host/settings.ts`
- Create: `plugin/src/cli.ts`
- Modify: `plugin/src/index.ts`
- Modify: `plugin/package.json`
- Test: `plugin/tests/host/settings.spec.ts`
- Test: `plugin/tests/cli.spec.ts`

**Interfaces:**
- Consumes: DSH Settings provider when present, private state repository, full group id confirmation.
- Produces: settings namespace `dsh-vault`, executable `dsh-vault`, sanitized audit event.

- [ ] **Step 1: Write failing settings and CLI tests**

```ts
it('requires the full group id before emergency removal', async () => {
  const result = await runCli(['protection', 'remove', '--group', 'group-1'], {
    stdin: lines('wrong-id'), state: protectedState('group-1'),
  })
  expect(result.exitCode).toBe(2)
  expect(result.state).toEqual(protectedState('group-1'))
})
```

Also test policy defaults, live policy adoption, disabled failed-attempt protection, no password fields in Settings descriptors, successful emergency removal, direct Session binding preservation, and sanitized audit output.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir plugin vitest run tests/host/settings.spec.ts tests/cli.spec.ts`

Expected: FAIL because settings and CLI modules do not exist.

- [ ] **Step 3: Implement settings registration and binary**

Use `installSettingsSection(ctx, settingsNamespace('dsh-vault'), VaultPolicySchema, defaults, { onChange })`. The package manifest exposes:

```json
{ "bin": { "dsh-vault": "./lib/cli.js" } }
```

The CLI reads the same state directory resolution as the Host, prints group name and member count, prompts for the full group id, commits binding removal atomically, appends an audit event, and never prints verifier fields.

- [ ] **Step 4: Run complete Host verification**

Run:

```bash
pnpm --dir plugin vitest run tests/host tests/cli.spec.ts
pnpm --dir plugin exec tsc -p tsconfig.host.json --noEmit
pnpm --dir plugin pack --pack-destination ../artifacts
```

Inspect the tarball with `pnpm pack --dry-run`; expected files include `lib/index.js`, `lib/cli.js`, `cordis.patch.yml`, declarations, README, and LICENSE, with no tests or source secrets.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/host/settings.ts plugin/src/cli.ts plugin/src/index.ts plugin/package.json plugin/tests
git commit -m "feat(vault): add policy settings and emergency reset"
```
