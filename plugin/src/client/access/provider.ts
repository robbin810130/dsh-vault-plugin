import type { VaultTarget } from '../../shared/contracts.js'
import type { VaultClientStore } from '../store-types.js'
import { resolveVaultTarget, type VaultProtectionResolution } from './resolution.js'
import { workspaceIdForSession } from '../rows/presentation.js'

export type NavigationAccessState =
  | { readonly kind: 'allow' }
  | { readonly kind: 'blocked'; readonly reason: string }

export interface NavigationDecision {
  readonly allow: boolean
  readonly handled?: boolean
}

export interface NavigationAccessProvider {
  matchesWorkspace(id: string): boolean
  matchesSession(id: string): boolean
  workspaceState(id: string): NavigationAccessState
  sessionState(id: string, workspaceId?: string): NavigationAccessState
  requestWorkspace(id: string): Promise<NavigationDecision>
  requestSession(id: string, workspaceId?: string): Promise<NavigationDecision>
  subscribe(listener: () => void): () => void
  dispose(): void
}

function targetState(store: VaultClientStore, target: VaultTarget): NavigationAccessState {
  const snapshot = store.getSnapshot()
  const resolution = resolveVaultTarget(snapshot, target)
  if (resolution.kind === 'plain') return { kind: 'allow' }
  if (resolution.kind === 'blocked') return { kind: 'blocked', reason: resolution.reason }
  if (snapshot.host !== 'ready' || !store.hasUnlockedGroup(resolution.groupId)) {
    return { kind: 'blocked', reason: snapshot.host === 'offline' ? 'Vault host unavailable' : 'Vault group locked' }
  }
  return { kind: 'allow' }
}

function protectedResolution(store: VaultClientStore, target: VaultTarget): VaultProtectionResolution {
  return resolveVaultTarget(store.getSnapshot(), target)
}

function decisionWithoutPrompt(store: VaultClientStore, target: VaultTarget): Promise<NavigationDecision> {
  const resolution = protectedResolution(store, target)
  if (resolution.kind === 'plain') return Promise.resolve({ allow: true })
  if (resolution.kind === 'blocked') return Promise.resolve({ allow: false, handled: true })
  // Selection is allowed so DSH can render the protected placeholder. The
  // content view remains blocked until its central unlock action succeeds.
  return Promise.resolve({ allow: true })
}

export function createVaultAccessProvider(store: VaultClientStore): NavigationAccessProvider {
  const listeners = new Set<() => void>()
  const sessionTarget = (id: string, workspaceId?: string): VaultTarget => ({
    type: 'session',
    id,
    ...((workspaceId ?? workspaceIdForSession(id)) === undefined ? {} : { workspaceId: workspaceId ?? workspaceIdForSession(id) }),
  })
  const matchesSession = (id: string): boolean => {
    const snapshot = store.getSnapshot()
    // DSH may probe this method before it knows the session's workspace.
    // An implicit workspace binding cannot be resolved safely at that point;
    // let requestSession(id, workspaceId) make the authoritative decision.
    const explicit = snapshot.bindings.some(binding => binding.targetType === 'session' && binding.targetId === id)
    const knownWorkspace = workspaceIdForSession(id)
    if (!explicit && knownWorkspace === undefined) return false
    return protectedResolution(store, sessionTarget(id)).kind !== 'plain'
  }
  const unsubscribe = store.subscribe(() => {
    for (const listener of [...listeners]) listener()
  })
  const requestSession = (id: string, workspaceId?: string): Promise<NavigationDecision> => {
    const resolution = protectedResolution(store, sessionTarget(id, workspaceId))
    if (resolution.kind === 'blocked') return Promise.resolve({ allow: true })
    return Promise.resolve({ allow: true })
  }
  return {
    matchesWorkspace: id => protectedResolution(store, { type: 'workspace', id }).kind !== 'plain',
    matchesSession,
    workspaceState: id => targetState(store, { type: 'workspace', id }),
    sessionState: (id, workspaceId) => targetState(store, sessionTarget(id, workspaceId)),
    requestWorkspace: id => decisionWithoutPrompt(store, { type: 'workspace', id }),
    requestSession,
    subscribe: listener => {
      listeners.add(listener)
      let active = true
      return () => { if (active) { active = false; listeners.delete(listener) } }
    },
    dispose: unsubscribe,
  }
}
