import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { LockIcon } from '../components/LockIcon.js'
import { resolveVaultTarget } from '../access/resolution.js'
import type { VaultClientStore } from '../store-types.js'
import { useVaultStore } from './controller.js'

export interface LockedConversationProps {
  readonly sessionId: string
  readonly reason?: string
  readonly store?: VaultClientStore
  readonly children?: ReactNode
}

function useSnapshot(store: VaultClientStore | undefined) {
  return useSyncExternalStore(
    listener => store?.subscribe(listener) ?? (() => undefined),
    () => store?.getSnapshot(),
    () => store?.getSnapshot(),
  )
}

export function LockedConversation({ sessionId, store: storeProp, children }: LockedConversationProps) {
  const store = useVaultStore(storeProp)
  const snapshot = useSnapshot(store)
  const target = snapshot?.prompt?.target.type === 'session' && snapshot.prompt.target.id === sessionId
    ? snapshot.prompt.target
    : { type: 'session' as const, id: sessionId }
  const resolution = snapshot === undefined ? { kind: 'blocked' as const, reason: 'Vault group locked' } : resolveVaultTarget(snapshot, target)
  const locked = resolution.kind !== 'plain'
    && (snapshot?.host !== 'ready' || resolution.kind !== 'protected' || !store?.hasUnlockedGroup(resolution.groupId))

  if (!locked) return <>{children}</>

  const requestUnlock = () => {
    if (store === undefined || snapshot?.host !== 'ready' || resolution.kind !== 'protected') return
    void store.requestUnlock(resolution.groupId, target)
  }

  return (
    <section className="dsh-vault-locked-conversation" aria-label="受保护">
      <LockIcon className="dsh-vault-locked-conversation-icon" />
      <p className="dsh-vault-locked-conversation-title">已上锁</p>
      <p className="dsh-vault-locked-conversation-copy">需要解锁才能查看内容</p>
      <button
        type="button"
        className="dsh-vault-button dsh-vault-button-primary"
        disabled={store === undefined || snapshot?.host !== 'ready' || resolution.kind !== 'protected'}
        onClick={requestUnlock}
      >
        解锁
      </button>
    </section>
  )
}
