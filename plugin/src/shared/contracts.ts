import type { VaultPolicy } from '../config.js'

export type { VaultPolicy } from '../config.js'

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

export interface RecoveryKeyResult {
  readonly snapshot: VaultSnapshot
  readonly recoveryKey: string
}

export interface UnlockResult {
  readonly grant: GrantProof
  readonly expiresAt: number
}

export interface GrantValidationResult {
  readonly valid: boolean
}

export interface ActivityTouchResult {
  readonly valid: boolean
  readonly touched: boolean
}
