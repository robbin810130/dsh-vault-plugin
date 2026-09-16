import type { ReactNode } from 'react'
import { useRef } from 'react'
import { LockIcon } from '../components/LockIcon.js'
import { resolveVaultTarget } from '../access/resolution.js'
import type { VaultClientStore } from '../store-types.js'
import { useVaultSnapshot, useVaultStore } from './controller.js'
import { workspaceIdForSession } from '../rows/presentation.js'

export interface LockedConversationProps {
  readonly sessionId: string
  /** Explicit undefined means pending membership; null confirms no workspace. */
  readonly workspaceId?: string | null | undefined
  readonly reason?: string
  readonly store?: VaultClientStore
  readonly children?: ReactNode
}

export function LockedConversation(props: LockedConversationProps) {
  const { sessionId, store: storeProp, children } = props
  const store = useVaultStore(storeProp)
  const snapshot = useVaultSnapshot(store)
  const knownWorkspaceId = workspaceIdForSession(sessionId)
  const promptedTarget = snapshot?.prompt?.target.type === 'session' && snapshot.prompt.target.id === sessionId
    ? snapshot.prompt.target
    : undefined
  const lastPromptedTarget = useRef<typeof promptedTarget>()
  if (promptedTarget !== undefined) lastPromptedTarget.current = promptedTarget
  const rememberedWorkspaceId = lastPromptedTarget.current?.id === sessionId
    ? lastPromptedTarget.current.workspaceId
    : undefined
  const authoritative = Object.prototype.hasOwnProperty.call(props, 'workspaceId')
  const workspaceId = authoritative ? props.workspaceId ?? undefined : knownWorkspaceId ?? rememberedWorkspaceId
  const target = (!authoritative ? promptedTarget : undefined) ?? { type: 'session' as const, id: sessionId, ...(workspaceId === undefined ? {} : { workspaceId }) }
  const resolution = snapshot === undefined
    ? { kind: 'blocked' as const, reason: 'Vault group locked' }
    : resolveVaultTarget(snapshot, target, { workspaceAbsent: authoritative && props.workspaceId === null })
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
