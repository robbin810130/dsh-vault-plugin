import { useLayoutEffect, useRef } from 'react'
import { resolveVaultTarget } from '../access/resolution.js'
import type { VaultClientStore } from '../store-types.js'
import { useVaultSnapshot } from './controller.js'
import { LockedConversation } from './LockedConversation.js'

export function VaultSessionGuard({ sessionId, workspaceId, workspaceLookup, store }: {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly workspaceLookup?: string
  readonly store?: VaultClientStore
}) {
  const guard = useRef<HTMLDivElement>(null)
  const snapshot = useVaultSnapshot(store)
  const resolvedWorkspaceId = workspaceId ?? workspaceLookup
  const resolution = snapshot === undefined
    ? { kind: 'blocked' as const, reason: 'Vault state unavailable' }
    : resolveVaultTarget(snapshot, { type: 'session', id: sessionId, ...(resolvedWorkspaceId === undefined ? {} : { workspaceId: resolvedWorkspaceId }) })
  const locked = resolution.kind !== 'plain'
    && (snapshot?.host !== 'ready' || resolution.kind !== 'protected' || store?.hasUnlockedGroup(resolution.groupId) !== true)
  useLayoutEffect(() => {
    if (!locked) return
    const root = guard.current?.parentElement
    if (root === null || root === undefined) return
    const previous = new Map<HTMLElement, boolean>()
    for (const child of root.children) {
      if (!(child instanceof HTMLElement) || child === guard.current) continue
      previous.set(child, child.inert)
      child.inert = true
    }
    return () => {
      for (const [child, wasInert] of previous) child.inert = wasInert
    }
  }, [locked])
  if (!locked) return null
  return <div ref={guard} className="dsh-vault-session-guard">
    <LockedConversation
      sessionId={sessionId}
      {...(resolvedWorkspaceId === undefined ? {} : { workspaceId: resolvedWorkspaceId })}
      {...(store === undefined ? {} : { store })}
    />
  </div>
}
