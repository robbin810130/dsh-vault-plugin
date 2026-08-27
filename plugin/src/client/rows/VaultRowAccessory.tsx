import { LockIcon } from '../components/LockIcon.js'
import type { VaultClientStore } from '../store-types.js'
import { resolveRowLockState, useVaultStore } from '../unlock/controller.js'

export interface VaultRowAccessoryProps {
  readonly locked?: boolean
  readonly kind?: 'workspace' | 'session'
  readonly inherited?: boolean
  readonly workspaceId?: string
  readonly sessionId?: string
  readonly store?: VaultClientStore
  readonly onUnlock?: () => void
}

export function VaultRowAccessory({
  locked: lockedProp,
  kind: kindProp,
  inherited: inheritedProp,
  workspaceId,
  sessionId,
  store: storeProp,
}: VaultRowAccessoryProps) {
  const store = useVaultStore(storeProp)
  const kind = kindProp ?? (sessionId !== undefined ? 'session' : workspaceId !== undefined ? 'workspace' : undefined)
  const state = resolveRowLockState(store, kind, workspaceId, sessionId)
  const locked = lockedProp ?? state.locked
  const inherited = inheritedProp ?? state.inherited
  if (!locked) return null

  return (
    <span className={`dsh-vault-row-accessory ${inherited ? 'dsh-vault-row-accessory-inherited' : 'dsh-vault-row-accessory-locked'}`} role="status" aria-live="polite" aria-label={inherited ? '继承项目保护' : '已上锁，受保护'}>
      <LockIcon className="dsh-vault-lock-icon" />
      <span className="dsh-vault-row-accessory-text">
        {inherited ? '继承项目保护' : '已上锁'}
      </span>
      {!inherited && <span className="dsh-vault-row-accessory-muted">受保护</span>}
    </span>
  )
}
