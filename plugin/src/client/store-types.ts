import type {
  ActivityTouchResult,
  BindingMutation,
  ChangePasswordInput,
  CreateGroupInput,
  GrantValidationResult,
  ProtectionBinding,
  RecoverGroupInput,
  RecoveryKeyResult,
  RedactedPasswordGroup,
  UnlockResult,
  VaultPolicy,
  VaultApiResult,
  VaultSnapshot,
  VaultTarget,
} from '../shared/contracts.js'

export interface UnlockPromptState {
  readonly groupId: string
  readonly target: VaultTarget
}

export interface VaultClientSnapshot {
  readonly host: 'loading' | 'ready' | 'offline'
  readonly revision: number
  readonly groups: readonly RedactedPasswordGroup[]
  readonly bindings: readonly ProtectionBinding[]
  readonly policy: VaultPolicy
  readonly unlockedGroupIds: ReadonlySet<string>
  readonly prompt: UnlockPromptState | null
}

export interface ChangePasswordResult {
  readonly snapshot: VaultSnapshot
  readonly recoveryKey?: string
}

export interface VaultClientStore {
  readonly clientInstanceId: string
  getSnapshot(): VaultClientSnapshot
  subscribe(listener: () => void): () => void
  refresh(signal?: AbortSignal): Promise<VaultApiResult<VaultClientSnapshot>>
  validateGrants(signal?: AbortSignal): Promise<VaultApiResult<GrantValidationResult>>
  touchActivity(signal?: AbortSignal): Promise<VaultApiResult<ActivityTouchResult>>
  unlock(groupId: string, password: string, signal?: AbortSignal): Promise<VaultApiResult<UnlockResult>>
  requestUnlock(groupId: string, target: VaultTarget): Promise<boolean>
  settleUnlock(groupId: string): void
  cancelUnlock(groupId: string): void
  lockGroup(groupId: string, signal?: AbortSignal): Promise<VaultApiResult<null>>
  lockAll(signal?: AbortSignal): Promise<VaultApiResult<null>>
  createGroup(input: CreateGroupInput, signal?: AbortSignal): Promise<VaultApiResult<RecoveryKeyResult>>
  changePassword(input: ChangePasswordInput, signal?: AbortSignal): Promise<VaultApiResult<ChangePasswordResult>>
  recoverGroup(input: RecoverGroupInput, signal?: AbortSignal): Promise<VaultApiResult<RecoveryKeyResult>>
  updateBindings(input: BindingMutation, signal?: AbortSignal): Promise<VaultApiResult<VaultSnapshot>>
}
