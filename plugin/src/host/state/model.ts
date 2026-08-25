import type { SecretVerifier } from '../crypto/verifier.js'
import type { ProtectionBinding } from '../../shared/contracts.js'

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

export type AuditEvent = Readonly<Record<string, unknown>>
