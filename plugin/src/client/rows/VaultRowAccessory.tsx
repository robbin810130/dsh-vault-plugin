import { LockIcon } from '../components/LockIcon.js'
import { useEffect, useRef } from 'react'
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
  const accessoryRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!locked || kind !== 'workspace' || typeof document === 'undefined') return
    const row = accessoryRef.current?.closest<HTMLElement>('[role="treeitem"]')
    if (row === null || row === undefined) return
    let redirected = false
    const collapse = () => {
      if (row.getAttribute('aria-expanded') !== 'true' || redirected) return
      redirected = true
      const siblings = row.parentElement?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []
      const firstSession = [...siblings].find(candidate => candidate !== row)
      firstSession?.click()
      row.click()
    }
    collapse()
    const observer = new MutationObserver(collapse)
    observer.observe(row, { attributes: true, attributeFilter: ['aria-expanded'] })
    return () => observer.disconnect()
  }, [kind, locked])

  if (!locked) return null

  return (
    <span ref={accessoryRef} className={`dsh-vault-row-accessory ${inherited ? 'dsh-vault-row-accessory-inherited' : 'dsh-vault-row-accessory-locked'}`} role="status" aria-live="polite" aria-label={inherited ? '继承项目保护' : '已上锁，受保护'}>
      <LockIcon className="dsh-vault-lock-icon" />
      <span className="dsh-vault-row-accessory-text">
        {inherited ? '继承项目保护' : '已上锁'}
      </span>
      {!inherited && <span className="dsh-vault-row-accessory-muted">受保护</span>}
    </span>
  )
}
