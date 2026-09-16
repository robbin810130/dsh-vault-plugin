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

export function rememberWorkspaceIdForSession(sessionId: string, workspaceId: string | null | undefined): void {
  if (workspaceId === undefined) return
  // Refresh recency, then evict the oldest entry so the map stays bounded.
  sessionWorkspaceIds.delete(sessionId)
  if (workspaceId === null) return
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
  /** Omitted context may use a remembered parent; explicit undefined invalidates it. null confirms an orphan. */
  session?(id: string, base: SessionRowPresentation, workspaceId?: string | null): SessionRowPresentation
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
      const snapshot = store.getSnapshot()
      if (snapshot.host !== 'ready') return conceal('workspace', t)
      const policy = snapshot.policy
      if (visible(store, 'workspace', id) || policy.lockedNameVisibility !== 'all-hidden') return base
      return conceal('workspace', t) as WorkspaceRowPresentation
    },
    session: (id, base, ...context: [workspaceId?: string | null]) => {
      const workspaceId = context[0]
      const authoritative = context.length > 0
      rememberWorkspaceIdForSession(id, authoritative ? workspaceId ?? null : undefined)
      const snapshot = store.getSnapshot()
      if (snapshot.host !== 'ready') return conceal('session', t)
      // A current host lookup always wins, including unknown membership.
      const parent = authoritative ? workspaceId ?? undefined : workspaceIdForSession(id)
      const resolution = resolveVaultTarget(snapshot, {
        type: 'session', id, ...(parent === undefined ? {} : { workspaceId: parent }),
      }, { workspaceAbsent: workspaceId === null })
      if (resolution.kind === 'plain' || (resolution.kind === 'protected' && snapshot.host === 'ready' && store.hasUnlockedGroup(resolution.groupId))) return base
      if (snapshot.policy.lockedNameVisibility === 'all-visible') return base
      return conceal('session', t) as SessionRowPresentation
    },
  }
}
