//#region src/host/crypto/verifier.d.ts
interface SecretVerifier {
  readonly salt: string;
  readonly verifier: string;
  readonly kdf: 'scrypt';
  readonly parameters: {
    readonly cost: 32768;
    readonly blockSize: 8;
    readonly parallelization: 1;
    readonly keyLength: 32;
  };
}
//#endregion
//#region src/shared/contracts.d.ts
interface VaultPolicy {
  readonly autoLockMinutes: 15 | 30 | 60 | 0;
  readonly lockOnSystemSleep: boolean;
  readonly lockedNameVisibility: 'workspace-visible-session-hidden' | 'all-visible' | 'all-hidden';
  readonly failedAttemptProtection: {
    readonly enabled: boolean;
    readonly maxAttempts: number;
    readonly cooldownSeconds: number;
  };
  readonly passwordPolicy: PasswordPolicy;
}
interface PasswordPolicy {
  readonly minLength: number;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireNumber: boolean;
  readonly requireSymbol: boolean;
}
type VaultTarget = {
  readonly type: 'workspace';
  readonly id: string;
} | {
  readonly type: 'session';
  readonly id: string;
  readonly workspaceId?: string;
};
interface ProtectionBinding {
  readonly targetType: 'workspace' | 'session';
  readonly targetId: string;
  readonly mode: 'direct' | 'inherit' | 'no-inherit';
  readonly passwordGroupId?: string;
  readonly workspaceId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
interface RedactedPasswordGroup {
  readonly id: string;
  readonly name: string;
  readonly credentialVersion: number;
  readonly recoveryConfigured: boolean;
  readonly recoveryGeneratedAt: string;
  readonly recoveryLastVerifiedAt?: string;
  readonly memberCount: number;
}
interface VaultSnapshot {
  readonly revision: number;
  readonly policy: VaultPolicy;
  readonly groups: readonly RedactedPasswordGroup[];
  readonly bindings: readonly ProtectionBinding[];
}
interface GrantProof {
  readonly groupId: string;
  readonly credentialVersion: number;
  readonly token: string;
}
interface CreateGroupInput {
  readonly name: string;
  readonly password: string;
  readonly bindings: readonly ProtectionBinding[];
}
interface ChangePasswordInput {
  readonly groupId: string;
  readonly currentPassword?: string;
  readonly recoveryKey?: string;
  readonly newPassword: string;
  readonly rotateRecovery: boolean;
}
interface RecoverGroupInput {
  readonly groupId: string;
  readonly recoveryKey: string;
  readonly newPassword: string;
}
type BindingMutation = {
  readonly kind: 'replace';
  readonly binding: ProtectionBinding;
} | {
  readonly kind: 'remove';
  readonly targetType: 'workspace' | 'session';
  readonly targetId: string;
} | {
  readonly kind: 'delete-group';
  readonly groupId: string;
  readonly moveToGroupId?: string;
  readonly removeProtection?: true;
};
type VaultApiRequest = {
  readonly action: 'snapshot';
  readonly clientInstanceId: string;
} | {
  readonly action: 'unlock';
  readonly clientInstanceId: string;
  readonly groupId: string;
  readonly password: string;
} | {
  readonly action: 'grants-validate';
  readonly clientInstanceId: string;
  readonly grants: readonly GrantProof[];
} | {
  readonly action: 'activity-touch';
  readonly clientInstanceId: string;
  readonly grants: readonly GrantProof[];
} | {
  readonly action: 'lock-group';
  readonly clientInstanceId: string;
  readonly groupId: string;
} | {
  readonly action: 'lock-all';
  readonly clientInstanceId: string;
} | {
  readonly action: 'group-create';
  readonly clientInstanceId: string;
  readonly expectedRevision: number;
  readonly grants: readonly GrantProof[];
  readonly input: CreateGroupInput;
  readonly intent?: string;
} | {
  readonly action: 'group-change-password';
  readonly clientInstanceId: string;
  readonly expectedRevision: number;
  readonly input: ChangePasswordInput;
} | {
  readonly action: 'group-recover';
  readonly clientInstanceId: string;
  readonly expectedRevision: number;
  readonly input: RecoverGroupInput;
} | {
  readonly action: 'bindings-update';
  readonly clientInstanceId: string;
  readonly expectedRevision: number;
  readonly grants: readonly GrantProof[];
  readonly input: BindingMutation;
};
type VaultApiResult<T> = {
  readonly ok: true;
  readonly value: T;
} | {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryAt?: number;
  };
};
interface RecoveryKeyResult {
  readonly snapshot: VaultSnapshot;
  readonly recoveryKey: string;
}
interface UnlockResult {
  readonly grant: GrantProof;
  readonly expiresAt: number;
}
interface GrantValidationResult {
  readonly valid: boolean;
}
interface ActivityTouchResult {
  readonly valid: boolean;
  readonly touched: boolean;
}
//#endregion
//#region src/host/state/model.d.ts
interface VaultState {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly groups: Readonly<Record<string, PasswordGroup>>;
  readonly bindings: readonly ProtectionBinding[];
}
interface PasswordGroup {
  readonly id: string;
  readonly name: string;
  readonly password: SecretVerifier;
  readonly recovery: SecretVerifier & {
    readonly generatedAt: string;
    readonly lastVerifiedAt?: string;
  };
  readonly credentialVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
type CommitResult = {
  readonly ok: true;
  readonly revision: number;
} | {
  readonly ok: false;
  readonly code: 'revision-conflict';
};
interface AuditEvent {
  readonly timestamp: string;
  readonly action: string;
  readonly clientInstanceId?: string;
  readonly groupId?: string;
  readonly targetType?: ProtectionBinding['targetType'];
  readonly targetId?: string;
  readonly workspaceId?: string;
  readonly revision?: number;
  readonly credentialVersion?: number;
  readonly count?: number;
  readonly result?: 'success' | 'denied' | 'failure';
  readonly reasonCode?: string;
}
//#endregion
export { VaultApiResult as _, BindingMutation as a, VaultTarget as b, GrantProof as c, ProtectionBinding as d, RecoverGroupInput as f, VaultApiRequest as g, UnlockResult as h, ActivityTouchResult as i, GrantValidationResult as l, RedactedPasswordGroup as m, CommitResult as n, ChangePasswordInput as o, RecoveryKeyResult as p, VaultState as r, CreateGroupInput as s, AuditEvent as t, PasswordPolicy as u, VaultPolicy as v, VaultSnapshot as y };
//# sourceMappingURL=model-CirJ7a2o.d.ts.map