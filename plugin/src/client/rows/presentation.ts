import type { VaultClientStore } from '../store-types.js'
import { resolveVaultTarget } from '../access/resolution.js'

export interface WorkspaceRowPresentation {
  readonly label: string
  readonly detail?: string
  readonly copyText?: string
  readonly tooltip?: string
  readonly ariaLabel: string
  readonly concealed: boolean
}

export interface SessionRowPresentation extends WorkspaceRowPresentation {
  readonly workspaceLabel?: string
  readonly snippet?: string
}

export type VaultTranslate = (key: 'workspace' | 'session') => string

const MAX_REMEMBERED_SESSIONS = 500
const sessionWorkspaceIds = new Map<string, string>()

export function rememberWorkspaceIdForSession(sessionId: string, workspaceId: string | undefined): void {
  if (workspaceId === undefined) return
  // Refresh recency, then evict the oldest entry so the map stays bounded.
  sessionWorkspaceIds.delete(sessionId)
  sessionWorkspaceIds.set(sessionId, workspaceId)
  if (sessionWorkspaceIds.size > MAX_REMEMBERED_SESSIONS) {
    const oldest = sessionWorkspaceIds.keys().next().value
    if (oldest !== undefined) sessionWorkspaceIds.delete(oldest)
  }
}

export function workspaceIdForSession(sessionId: string): string | undefined {
  return sessionWorkspaceIds.get(sessionId)
}

export interface WorkspaceRowDecorator {
  workspace?(id: string, base: WorkspaceRowPresentation): WorkspaceRowPresentation
  session?(id: string, base: SessionRowPresentation, workspaceId?: string): SessionRowPresentation
}

function conceal(kind: 'workspace' | 'session', t: VaultTranslate): WorkspaceRowPresentation | SessionRowPresentation {
  const label = t(kind)
  return { label, ariaLabel: label, concealed: true }
}

function visible(store: VaultClientStore, type: 'workspace' | 'session', id: string, workspaceId?: string): boolean {
  const resolution = resolveVaultTarget(store.getSnapshot(), type === 'workspace'
    ? { type, id }
    : { type, id, ...(workspaceId === undefined ? {} : { workspaceId }) })
  return resolution.kind === 'plain'
    || (resolution.kind === 'protected' && store.getSnapshot().host === 'ready' && store.hasUnlockedGroup(resolution.groupId))
}

export function createVaultRowDecorator(store: VaultClientStore, t: VaultTranslate): WorkspaceRowDecorator {
  return {
    workspace: (id, base) => {
      const policy = store.getSnapshot().policy
      if (visible(store, 'workspace', id) || policy.lockedNameVisibility !== 'all-hidden') return base
      return conceal('workspace', t) as WorkspaceRowPresentation
    },
    session: (id, base, workspaceId) => {
      rememberWorkspaceIdForSession(id, workspaceId)
      const snapshot = store.getSnapshot()
      // DSH's row decorator API does not provide workspaceId. Without it we
      // cannot safely resolve implicit workspace protection, so leave the
      // native title untouched and let navigation access enforce the lock.
      if (workspaceId === undefined && !snapshot.bindings.some(binding => binding.targetType === 'session' && binding.targetId === id)) return base
      const resolution = resolveVaultTarget(snapshot, { type: 'session', id, ...(workspaceId === undefined ? {} : { workspaceId }) })
      if (resolution.kind === 'plain' || (resolution.kind === 'protected' && snapshot.host === 'ready' && store.hasUnlockedGroup(resolution.groupId))) return base
      if (snapshot.policy.lockedNameVisibility === 'all-visible') return base
      return conceal('session', t) as SessionRowPresentation
    },
  }
}
