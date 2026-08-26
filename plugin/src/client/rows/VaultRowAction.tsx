import { useEffect, useRef, useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const store = useVaultStore(storeProp)
  const kind = kindProp ?? (sessionId !== undefined ? 'session' : workspaceId !== undefined ? 'workspace' : undefined)
  const state = resolveRowLockState(store, kind, workspaceId, sessionId)
  const locked = lockedProp ?? state.locked

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => { document.removeEventListener('mousedown', close) }
  }, [open])

  if (!locked && onLock === undefined) return null

  const choose = (callback: (() => void) | undefined) => {
    setOpen(false)
    callback?.()
  }

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
        </span>
      )}
    </span>
  )
}
