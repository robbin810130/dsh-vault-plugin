import { LockIcon } from '../components/LockIcon.js'
import type { ProtectionBinding, VaultTarget } from '../../shared/contracts.js'
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
  const target: VaultTarget | undefined = kind === 'workspace' && workspaceId !== undefined
    ? { type: 'workspace', id: workspaceId }
    : kind === 'session' && sessionId !== undefined
      ? { type: 'session', id: sessionId, ...(workspaceId === undefined ? {} : { workspaceId }) }
      : undefined
  const binding = snapshot?.bindings.find(candidate => candidate.targetType === kind && candidate.targetId === target?.id)
  const canManage = store !== undefined && target !== undefined && (snapshot?.groups.length ?? 0) > 0
  if (!canManage && (locked ? onUnlock : onLock) === undefined) return null

  const toggle = () => {
    if (locked) { onUnlock?.(); return }
    if (onLock !== undefined) { onLock(); return }
    if (store === undefined || target === undefined || snapshot === undefined) return
    if (binding?.passwordGroupId !== undefined) { void store.lockGroup(binding.passwordGroupId); return }
    const group = snapshot.groups[0]
    if (group === undefined) return
    const now = new Date().toISOString()
    const next: ProtectionBinding = {
      targetType: target.type,
      targetId: target.id,
      mode: 'direct',
      passwordGroupId: group.id,
      ...(target.type === 'session' && target.workspaceId !== undefined ? { workspaceId: target.workspaceId } : {}),
      createdAt: now,
      updatedAt: now,
    }
    void store.updateBindings({ kind: 'replace', binding: next })
  }

  return (
    <span className="dsh-vault-row-action">
      <button
        type="button"
        className="dsh-vault-row-action-button"
        aria-label={locked ? '解锁' : '上锁'}
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
      >
        <LockIcon className="dsh-vault-lock-icon" />
      </button>
    </span>
  )
}
