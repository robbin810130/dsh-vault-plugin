import { LockIcon } from '../components/LockIcon.js'
import type { VaultClientStore } from '../store-types.js'
import { resolveRowLockState, useVaultStore } from '../unlock/controller.js'

export interface VaultRowActionProps {
  readonly locked?: boolean
  readonly kind?: 'workspace' | 'session'
  readonly workspaceId?: string
  readonly sessionId?: string
  readonly store?: VaultClientStore
  readonly onUnlock?: () => void
  readonly onLock?: () => void
}

export function VaultRowAction({
  locked: lockedProp,
  kind: kindProp,
  workspaceId,
  sessionId,
  store: storeProp,
  onUnlock,
  onLock,
}: VaultRowActionProps) {
  const store = useVaultStore(storeProp)
  const kind = kindProp ?? (sessionId !== undefined ? 'session' : workspaceId !== undefined ? 'workspace' : undefined)
  const state = resolveRowLockState(store, kind, workspaceId, sessionId)
  const locked = lockedProp ?? state.locked
  const snapshot = store?.getSnapshot()
  const targetId = kind === 'workspace' ? workspaceId : sessionId
  const hasBinding = snapshot !== undefined && kind !== undefined && targetId !== undefined
    && snapshot.bindings.some(binding => binding.targetType === kind && binding.targetId === targetId)
  const hasPasswordGroup = (snapshot?.groups.length ?? 0) > 0
  if (!locked && onLock === undefined && (store === undefined || kind === undefined || (!hasBinding && !hasPasswordGroup))) return null

  return (
    <span className="dsh-vault-row-action">
      <button
        type="button"
        className="dsh-vault-row-action-button"
        aria-label={locked ? '解锁' : '上锁'}
        onClick={(event) => {
          event.stopPropagation()
          ;(locked ? onUnlock : onLock)?.()
        }}
      >
        <LockIcon className="dsh-vault-lock-icon" />
      </button>
    </span>
  )
}
