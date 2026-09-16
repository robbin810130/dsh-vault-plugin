import type { VaultTarget } from '../../shared/contracts.js'
import type { VaultClientStore } from '../store-types.js'
import { resolveVaultTarget, type VaultProtectionResolution } from './resolution.js'
import { rememberWorkspaceIdForSession, workspaceIdForSession } from '../rows/presentation.js'

export type NavigationAccessState =
  | { readonly kind: 'allow' }
  | { readonly kind: 'blocked'; readonly reason: string }

export interface NavigationDecision {
  readonly allow: boolean
  readonly handled?: boolean
}

export interface NavigationAccessProvider {
  matchesWorkspace(id: string): boolean
  matchesSession(id: string, workspaceId?: string | null): boolean
  workspaceState(id: string): NavigationAccessState
  sessionState(id: string, workspaceId?: string | null): NavigationAccessState
  requestWorkspace(id: string): Promise<NavigationDecision>
  requestSession(id: string, workspaceId?: string | null): Promise<NavigationDecision>
  subscribe(listener: () => void): () => void
  dispose(): void
}

function targetState(store: VaultClientStore, target: VaultTarget, workspaceAbsent = false): NavigationAccessState {
  const snapshot = store.getSnapshot()
  const resolution = resolveVaultTarget(snapshot, target, { workspaceAbsent })
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
  const sessionTarget = (id: string, ...context: [workspaceId?: string | null]): { target: VaultTarget; workspaceAbsent: boolean } => {
    const workspaceId = context[0]
    rememberWorkspaceIdForSession(id, context.length > 0 ? workspaceId ?? null : undefined)
    // null means the host confirmed this session has no parent workspace;
    // do not fall back to remembered context in that case.
    if (workspaceId === null) return { target: { type: 'session', id }, workspaceAbsent: true }
    const resolvedWorkspaceId = workspaceId ?? workspaceIdForSession(id)
    return resolvedWorkspaceId === undefined
      ? { target: { type: 'session', id }, workspaceAbsent: false }
      : { target: { type: 'session', id, workspaceId: resolvedWorkspaceId }, workspaceAbsent: false }
  }
  const matchesSession = (id: string, ...context: [workspaceId?: string | null]): boolean => {
    const { target, workspaceAbsent } = sessionTarget(id, ...context)
    return resolveVaultTarget(store.getSnapshot(), target, { workspaceAbsent }).kind !== 'plain'
  }
  const unsubscribe = store.subscribe(() => {
    for (const listener of [...listeners]) listener()
  })
  const requestSession = (id: string, ...context: [workspaceId?: string | null]): Promise<NavigationDecision> => {
    sessionTarget(id, ...context)
    // Selection may render the placeholder; sessionState still guards content.
    return Promise.resolve({ allow: true })
  }
  return {
    matchesWorkspace: id => protectedResolution(store, { type: 'workspace', id }).kind !== 'plain',
    matchesSession,
    workspaceState: id => targetState(store, { type: 'workspace', id }),
    sessionState: (id, ...context) => {
      const { target, workspaceAbsent } = sessionTarget(id, ...context)
      return targetState(store, target, workspaceAbsent)
    },
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
