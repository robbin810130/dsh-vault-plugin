import { useEffect, useMemo, useRef, useState } from 'react'
import { LockIcon } from '../components/LockIcon.js'
import type { BindingMutation, ProtectionBinding, VaultTarget } from '../../shared/contracts.js'
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
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)
  const store = useVaultStore(storeProp)
  const kind = kindProp ?? (sessionId !== undefined ? 'session' : workspaceId !== undefined ? 'workspace' : undefined)
  const state = resolveRowLockState(store, kind, workspaceId, sessionId)
  const locked = lockedProp ?? state.locked
  const snapshot = store?.getSnapshot()
  const binding = useMemo(() => {
    if (snapshot === undefined || kind === undefined) return undefined
    const targetId = kind === 'workspace' ? workspaceId : sessionId
    return snapshot.bindings.find(candidate => candidate.targetType === kind && candidate.targetId === targetId)
  }, [kind, sessionId, snapshot, workspaceId])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => { document.removeEventListener('mousedown', close) }
  }, [open])

  if (!locked && onLock === undefined && (store === undefined || kind === undefined)) return null

  const choose = (callback: (() => void) | undefined) => {
    setOpen(false)
    callback?.()
  }

  const target: VaultTarget | undefined = kind === 'workspace' && workspaceId !== undefined
    ? { type: 'workspace', id: workspaceId }
    : kind === 'session' && sessionId !== undefined
      ? { type: 'session', id: sessionId, ...(workspaceId === undefined ? {} : { workspaceId }) }
      : undefined

  const mutateBinding = async (mutation: BindingMutation, groupIds: readonly string[]) => {
    if (store === undefined || target === undefined) return
    setError(null)
    for (const groupId of groupIds) {
      if (!store.hasUnlockedGroup(groupId) && !(await store.requestUnlock(groupId, target))) {
        setError('请先解锁对应密码组')
        return
      }
    }
    const result = await store.updateBindings(mutation)
    if (result.ok) {
      setOpen(false)
      return
    }
    if (result.error.code === 'revision-conflict') {
      await store.refresh()
      setError('配置已变化，已刷新，请重试')
      return
    }
    if (result.error.code === 'invalid-credentials') {
      setError('请先解锁对应密码组')
      return
    }
    setError('保险箱暂时不可用，请稍后重试')
  }

  const createBinding = (groupId: string, mode: ProtectionBinding['mode']) => {
    if (target === undefined) return
    const now = new Date().toISOString()
    const next: ProtectionBinding = {
      targetType: target.type,
      targetId: target.id,
      mode,
      ...(mode === 'direct' ? { passwordGroupId: groupId } : {}),
      ...(target.type === 'session' && target.workspaceId !== undefined ? { workspaceId: target.workspaceId } : {}),
      createdAt: binding?.createdAt ?? now,
      updatedAt: now,
    }
    void mutateBinding({ kind: 'replace', binding: next }, [groupId])
  }

  const removeBinding = () => {
    if (binding === undefined) return
    void mutateBinding({ kind: 'remove', targetType: binding.targetType, targetId: binding.targetId }, binding.passwordGroupId === undefined ? [] : [binding.passwordGroupId])
  }

  const groups = snapshot?.groups ?? []
  const workspaceBinding = kind === 'session' && workspaceId !== undefined
    ? snapshot?.bindings.find(candidate => candidate.targetType === 'workspace' && candidate.targetId === workspaceId)
    : undefined
  const inheritsWorkspace = (kind === 'session' && binding?.mode === 'inherit')
    || (kind === 'session' && binding === undefined && workspaceBinding?.mode === 'direct')

  return (
    <span className="dsh-vault-row-action" ref={rootRef}>
      <button
        type="button"
        className="dsh-vault-row-action-button"
        aria-label="保险箱操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(value => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      >
        <LockIcon className="dsh-vault-lock-icon" />
      </button>
      {open && (
        <span className="dsh-vault-row-menu" role="menu">
          {locked
            ? (
              <button
                type="button"
                role="menuitem"
                className="dsh-vault-row-menu-item"
                onClick={(event) => {
                  event.stopPropagation()
                  choose(onUnlock)
                }}
              >
                解锁
              </button>
            )
            : (
              <button
                type="button"
                role="menuitem"
                className="dsh-vault-row-menu-item"
                onClick={(event) => {
                  event.stopPropagation()
                  choose(onLock)
                }}
              >
                上锁
              </button>
            )}
          {store !== undefined && target !== undefined && (
            <>
              {kind === 'workspace' && groups.map(group => (
                <button key={group.id} type="button" role="menuitem" className="dsh-vault-row-menu-item" onClick={(event) => { event.stopPropagation(); createBinding(group.id, 'direct') }}>
                  使用 {group.name} 保护
                </button>
              ))}
              {kind === 'session' && (
                <>
                  {inheritsWorkspace && workspaceBinding?.passwordGroupId !== undefined && (
                    <button type="button" role="menuitem" className="dsh-vault-row-menu-item" onClick={(event) => { event.stopPropagation(); createBinding(workspaceBinding.passwordGroupId!, 'no-inherit') }}>
                      不继承项目保护
                    </button>
                  )}
                  {groups.map(group => (
                    <button key={group.id} type="button" role="menuitem" className="dsh-vault-row-menu-item" onClick={(event) => { event.stopPropagation(); createBinding(group.id, 'direct') }}>
                      直接使用 {group.name} 保护
                    </button>
                  ))}
                  {!inheritsWorkspace && binding === undefined && workspaceBinding?.mode === 'direct' && workspaceBinding.passwordGroupId !== undefined && (
                    <button type="button" role="menuitem" className="dsh-vault-row-menu-item" onClick={(event) => { event.stopPropagation(); createBinding(workspaceBinding.passwordGroupId!, 'inherit') }}>
                      继承项目保护
                    </button>
                  )}
                </>
              )}
              {binding !== undefined && (
                <button type="button" role="menuitem" className="dsh-vault-row-menu-item" onClick={(event) => { event.stopPropagation(); removeBinding() }}>
                  解除保护
                </button>
              )}
            </>
          )}
          {error !== null && <span className="dsh-vault-row-menu-error" role="alert">{error}</span>}
        </span>
      )}
    </span>
  )
}
