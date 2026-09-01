import { _ as VaultApiResult, a as BindingMutation, b as VaultTarget, c as GrantProof, d as ProtectionBinding, f as RecoverGroupInput, g as VaultApiRequest, h as UnlockResult, i as ActivityTouchResult, l as GrantValidationResult, m as RedactedPasswordGroup, n as CommitResult, o as ChangePasswordInput, p as RecoveryKeyResult, r as VaultState, s as CreateGroupInput, t as AuditEvent, u as PasswordPolicy, v as VaultPolicy, y as VaultSnapshot } from "./model-CirJ7a2o.js";
import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
//#region src/config.d.ts
interface Config {
  readonly stateDir?: string;
}
interface VaultPolicyInput {
  readonly autoLockMinutes?: 15 | 30 | 60 | 0;
  readonly lockOnSystemSleep?: boolean;
  readonly lockedNameVisibility?: 'workspace-visible-session-hidden' | 'all-visible' | 'all-hidden';
  readonly failedAttemptProtection?: {
    readonly enabled?: boolean;
    readonly maxAttempts?: number;
    readonly cooldownSeconds?: number;
  };
  readonly passwordPolicy?: {
    readonly minLength?: number;
    readonly requireUppercase?: boolean;
    readonly requireLowercase?: boolean;
    readonly requireNumber?: boolean;
    readonly requireSymbol?: boolean;
  };
}
declare const ConfigSchema: z<Config>;
declare const Config: z<Config>;
declare function resolveStateDirectory(stateDir?: string, environment?: NodeJS.ProcessEnv): string;
declare const VaultPolicySchema: z<VaultPolicyInput, VaultPolicy>;
//#endregion
//#region src/host/auth/attempts.d.ts
type FailedAttemptPolicy = VaultPolicy['failedAttemptProtection'];
type AttemptAvailability = {
  readonly kind: 'allowed';
} | {
  readonly kind: 'cooldown';
  readonly retryAt: number;
};
type FailedAttemptDecision = {
  readonly kind: 'rejected';
  readonly remainingAttempts?: number;
} | {
  readonly kind: 'cooldown';
  readonly retryAt: number;
};
interface FailedAttemptStoreDependencies {
  readonly monotonicNow: () => number;
  readonly wallNow: () => number;
}
declare class FailedAttemptStore {
  private readonly dependencies;
  private readonly groups;
  private lastMonotonicNow?;
  constructor(dependencies?: Partial<FailedAttemptStoreDependencies>);
  check(groupId: string, clientInstanceId: string, policy: FailedAttemptPolicy): AttemptAvailability;
  recordFailure(groupId: string, clientInstanceId: string, policy: FailedAttemptPolicy): FailedAttemptDecision;
  setPolicy(policy: FailedAttemptPolicy): void;
  recordSuccess(groupId: string, clientInstanceId: string): void;
  resetGroup(groupId: string): void;
  resetClient(clientInstanceId: string): void;
  clear(): void;
  private get;
  private set;
  private delete;
  private readMonotonicNow;
  private failClosedRetryAt;
  private deadlineFrom;
}
//#endregion
//#region src/host/auth/grants.d.ts
interface UnlockGrant {
  readonly token: string;
  readonly groupId: string;
  readonly credentialVersion: number;
  readonly clientInstanceId: string;
  readonly issuedAt: number;
  /** Display-only wall-clock timestamp; NO_IDLE_EXPIRY means no idle deadline. */
  readonly expiresAt: number;
}
type GrantTouchResult = {
  readonly authorized: true; /** Display-only; never used for authorization. */
  readonly expiresAt: number;
} | {
  readonly authorized: false;
};
interface GrantStore {
  issue(groupId: string, credentialVersion: number, clientInstanceId: string, ttlMs: number): UnlockGrant;
  authorize(token: string, groupId: string, credentialVersion: number, clientInstanceId: string): boolean;
  touch(token: string, groupId: string, credentialVersion: number, clientInstanceId: string, ttlMs: number): GrantTouchResult;
  revokeGroup(groupId: string): void;
  revokeGroupForClient(groupId: string, clientInstanceId: string): void;
  revokeClient(clientInstanceId: string): void;
  clear(): void;
}
//#endregion
//#region src/host/state/repository.d.ts
interface RepositoryFileHandle {
  writeFile(data: string): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}
interface RepositoryFileSystem {
  mkdir(path: string, options: {
    recursive: true;
    mode: number;
  }): Promise<string | undefined>;
  chmod(path: string, mode: number): Promise<void>;
  open(path: string, flags: string, mode?: number): Promise<RepositoryFileHandle>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  readdir(path: string): Promise<string[]>;
  copyFile(source: string, destination: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
  truncate(path: string, length: number): Promise<void>;
}
declare class VaultStateRepository {
  #private;
  readonly stateDirectory: string;
  readonly fileSystem: RepositoryFileSystem;
  constructor(stateDirectory: string, fileSystem?: RepositoryFileSystem);
  load(): Promise<VaultState>;
  commit(expectedRevision: number, next: VaultState): Promise<CommitResult>;
  commitWithAudit(expectedRevision: number, next: VaultState, attempt: AuditEvent, success: AuditEvent): Promise<CommitResult>;
  appendAudit(event: AuditEvent): Promise<void>;
}
//#endregion
//#region src/host/service.d.ts
interface VaultRepository {
  load(): Promise<VaultState>;
  commit(expectedRevision: number, next: VaultState): Promise<{
    ok: true;
    revision: number;
  } | {
    ok: false;
    code: 'revision-conflict';
  }>;
  appendAudit(event: Parameters<VaultStateRepository['appendAudit']>[0]): Promise<void>;
}
interface VaultServiceDependencies {
  readonly repository: VaultRepository;
  readonly policy: VaultPolicy;
  readonly grants?: GrantStore;
  readonly attempts?: FailedAttemptStore;
  readonly now?: () => string;
  readonly wallNow?: () => number;
}
type ServiceResult = VaultApiResult<any>;
declare class VaultService {
  #private;
  readonly repository: VaultRepository;
  readonly grants: GrantStore;
  readonly attempts: FailedAttemptStore;
  constructor(dependencies: VaultServiceDependencies);
  get policy(): VaultPolicy;
  setPolicy(policy: VaultPolicy): void;
  snapshot(): Promise<VaultSnapshot>;
  handle(request: VaultApiRequest): Promise<ServiceResult>;
  validateGrants(clientInstanceId: string, proofs: readonly GrantProof[]): {
    readonly valid: boolean;
  };
  touchActivity(clientInstanceId: string, proofs: readonly GrantProof[]): {
    readonly valid: boolean;
    readonly touched: boolean;
  };
  lockGroup(clientInstanceId: string, groupId: string): ServiceResult;
  lockAll(clientInstanceId: string): ServiceResult;
  dispose(): void;
  private invalidateVolatileState;
  private unlock;
  private createGroup;
  private changePassword;
  private recoverGroup;
  private updateBindings;
  private authorizeAffectedGroups;
  private bindingAffectedGroups;
  private authorizeCredential;
  private ttlMs;
  private state;
  private refreshState;
  private reconcileExternalState;
  private commit;
  private audit;
  private safeAudit;
  private redacted;
}
//#endregion
//#region src/host/settings.d.ts
declare const DEFAULT_VAULT_POLICY: VaultPolicy;
interface VaultPolicySettingsController {
  readonly onChange: (policy: VaultPolicy) => void;
}
declare function createVaultPolicySettings(service: VaultService): VaultPolicySettingsController;
declare function installVaultPolicySettings(ctx: Context, service: VaultService, entry?: VaultPolicy): void;
//#endregion
//#region src/index.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    readonly vault: VaultService;
    webServer: WebServer;
  }
}
declare const inject: readonly ["webServer"];
declare const name = "dsh-vault";
declare function apply(ctx: Context, config: Config): void;
declare namespace apply {
  var inject: readonly ["webServer"];
}
//#endregion
export { ActivityTouchResult, BindingMutation, ChangePasswordInput, Config, ConfigSchema, CreateGroupInput, DEFAULT_VAULT_POLICY, GrantProof, GrantValidationResult, PasswordPolicy, ProtectionBinding, RecoverGroupInput, RecoveryKeyResult, RedactedPasswordGroup, UnlockResult, VaultApiRequest, VaultApiResult, VaultPolicy, VaultPolicySchema, VaultPolicySettingsController, VaultSnapshot, VaultTarget, apply, createVaultPolicySettings, inject, installVaultPolicySettings, name, resolveStateDirectory };
//# sourceMappingURL=index.d.ts.map