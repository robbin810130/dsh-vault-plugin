import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { VaultClientStore } from '../store-types.js'
import { useVaultStore } from '../unlock/controller.js'
import { UnlockDialog } from '../unlock/UnlockDialog.js'
import { recoveryDeliveryFor } from './recovery-delivery.js'

function RecoveryOverlay({ store }: { readonly store: VaultClientStore }) {
  const delivery = recoveryDeliveryFor(store)
  const pending = useSyncExternalStore(delivery.subscribe, delivery.getSnapshot, delivery.getSnapshot)
  const confirm = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (pending === null) return
    const previous = document.activeElement
    confirm.current?.focus()
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [pending])
  if (pending === null) return <UnlockDialog store={store} />
  return createPortal(<div className="dsh-vault-dialog-backdrop">
    <section className="dsh-vault-dialog" role="dialog" aria-modal="true" aria-label="请保存恢复密钥"
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault(); event.stopPropagation(); confirm.current?.focus()
        }
      }}>
      <h2>请保存恢复密钥</h2>
      <p>保护已生效。请将恢复密钥保存在安全位置，确认后不再显示。</p>
      <output className="dsh-vault-recovery-key">{pending.key}</output>
      <p>刷新或关闭页面会丢失本次展示，服务器无法再次读取旧密钥。若未保存但仍记得密码，可在修改密码时轮换恢复密钥。</p>
      <button ref={confirm} type="button" className="dsh-vault-button dsh-vault-button-primary" onClick={() => delivery.acknowledge(pending)}>我已保存恢复密钥</button>
    </section>
  </div>, document.body)
}

export function VaultOverlays({ store: explicit }: { readonly store?: VaultClientStore }) {
  const store = useVaultStore(explicit)
  return store === undefined ? null : <RecoveryOverlay store={store} />
}
