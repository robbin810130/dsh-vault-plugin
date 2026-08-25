import type { VaultTarget } from '../../shared/contracts.js'
import type { VaultClientStore } from '../store-types.js'
import { resolveVaultTarget, type VaultProtectionResolution } from './resolution.js'

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
  sessionState(id: string): NavigationAccessState
  requestWorkspace(id: string): Promise<NavigationDecision>
  requestSession(id: string): Promise<NavigationDecision>
  subscribe(listener: () => void): () => void
}

function targetState(store: VaultClientStore, target: VaultTarget): NavigationAccessState {
  const snapshot = store.getSnapshot()
  const resolution = resolveVaultTarget(snapshot, target)
  if (resolution.kind === 'plain') return { kind: 'allow' }
  if (resolution.kind === 'blocked') return { kind: 'blocked', reason: resolution.reason }
  if (snapshot.host !== 'ready' || !snapshot.unlockedGroupIds.has(resolution.groupId)) {
    return { kind: 'blocked', reason: snapshot.host === 'offline' ? 'Vault host unavailable' : 'Vault group locked' }
  }
  return { kind: 'allow' }
}

function protectedResolution(store: VaultClientStore, target: VaultTarget): VaultProtectionResolution {
  return resolveVaultTarget(store.getSnapshot(), target)
}

function decisionFor(store: VaultClientStore, target: VaultTarget): Promise<NavigationDecision> {
  const resolution = protectedResolution(store, target)
  if (resolution.kind === 'plain') return Promise.resolve({ allow: true })
  if (resolution.kind === 'blocked') return Promise.resolve({ allow: false, handled: true })
  const snapshot = store.getSnapshot()
  if (snapshot.host !== 'ready') return Promise.resolve({ allow: false, handled: true })
  const otherPrompt = snapshot.prompt !== null && snapshot.prompt.groupId !== resolution.groupId
  if (otherPrompt) return Promise.resolve({ allow: false })
  return store.requestUnlock(resolution.groupId, target).then(allow => ({
    allow,
    ...(allow ? {} : { handled: true }),
  }))
}

export function createVaultAccessProvider(store: VaultClientStore): NavigationAccessProvider {
  const listeners = new Set<() => void>()
  const unsubscribe = store.subscribe(() => {
    for (const listener of [...listeners]) listener()
  })
  return {
    matchesWorkspace: id => protectedResolution(store, { type: 'workspace', id }).kind !== 'plain',
    matchesSession: id => protectedResolution(store, { type: 'session', id }).kind !== 'plain',
    workspaceState: id => targetState(store, { type: 'workspace', id }),
    sessionState: id => targetState(store, { type: 'session', id }),
    requestWorkspace: id => decisionFor(store, { type: 'workspace', id }),
    requestSession: id => decisionFor(store, { type: 'session', id }),
    subscribe: listener => {
      listeners.add(listener)
      let active = true
      return () => { if (active) { active = false; listeners.delete(listener) } }
    },
    dispose: unsubscribe,
  } as NavigationAccessProvider & { dispose: () => void }
}
