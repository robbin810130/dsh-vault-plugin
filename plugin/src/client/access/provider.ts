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
  requestSession(id: string, workspaceId?: string): Promise<NavigationDecision>
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
  const sessionTarget = (id: string, workspaceId?: string | null): { target: VaultTarget; workspaceAbsent: boolean } => {
    // null means the host confirmed this session has no parent workspace;
    // do not fall back to remembered context in that case.
    if (workspaceId === null) return { target: { type: 'session', id }, workspaceAbsent: true }
    const resolvedWorkspaceId = workspaceId ?? workspaceIdForSession(id)
    return resolvedWorkspaceId === undefined
      ? { target: { type: 'session', id }, workspaceAbsent: false }
      : { target: { type: 'session', id, workspaceId: resolvedWorkspaceId }, workspaceAbsent: false }
  }
  const matchesSession = (id: string, workspaceId?: string | null): boolean => {
    const snapshot = store.getSnapshot()
    if (typeof workspaceId === 'string') rememberWorkspaceIdForSession(id, workspaceId)
    const explicit = snapshot.bindings.some(binding => binding.targetType === 'session' && binding.targetId === id)
    if (explicit) {
      const { target, workspaceAbsent } = sessionTarget(id, workspaceId)
      return resolveVaultTarget(snapshot, target, { workspaceAbsent }).kind !== 'plain'
    }
    // Host-confirmed absence of a parent workspace: nothing to inherit.
    if (workspaceId === null) return false
    const rememberedWorkspaceId = workspaceId ?? workspaceIdForSession(id)
    // The workspace browser remembers the owning workspace before this probe.
    // Claim inherited sessions too, so ConversationRoot can render its locked
    // placeholder after selection instead of opening protected content.
    if (rememberedWorkspaceId === undefined) {
      const workspaceBindings = snapshot.bindings.filter(binding => binding.targetType === 'workspace')
      // Fail closed whenever any workspace protection exists: refusing to claim
      // here would let DSH render a possibly-inherited session without checks.
      if (workspaceBindings.length === 0) return false
      const [workspaceBinding] = workspaceBindings
      if (workspaceBinding === undefined) return false
      return protectedResolution(store, { type: 'session', id, workspaceId: workspaceBinding.targetId }).kind !== 'plain'
    }
    return protectedResolution(store, { type: 'session', id, workspaceId: rememberedWorkspaceId }).kind !== 'plain'
  }
  const unsubscribe = store.subscribe(() => {
    for (const listener of [...listeners]) listener()
  })
  const requestSession = (id: string, workspaceId?: string): Promise<NavigationDecision> => {
    rememberWorkspaceIdForSession(id, workspaceId)
    const { target } = sessionTarget(id, workspaceId)
    const resolution = protectedResolution(store, target)
    if (resolution.kind === 'blocked') return Promise.resolve({ allow: true })
    return Promise.resolve({ allow: true })
  }
  return {
    matchesWorkspace: id => protectedResolution(store, { type: 'workspace', id }).kind !== 'plain',
    matchesSession,
    workspaceState: id => targetState(store, { type: 'workspace', id }),
    sessionState: (id, workspaceId) => {
      const { target, workspaceAbsent } = sessionTarget(id, workspaceId)
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
