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

export interface WorkspaceRowDecorator {
  workspace?(id: string, base: WorkspaceRowPresentation): WorkspaceRowPresentation
  session?(id: string, base: SessionRowPresentation): SessionRowPresentation
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
    || (resolution.kind === 'protected' && store.getSnapshot().host === 'ready' && store.getSnapshot().unlockedGroupIds.has(resolution.groupId))
}

export function createVaultRowDecorator(store: VaultClientStore, t: VaultTranslate): WorkspaceRowDecorator {
  return {
    workspace: (id, base) => {
      const policy = store.getSnapshot().policy
      if (visible(store, 'workspace', id) || policy.lockedNameVisibility !== 'all-hidden') return base
      return conceal('workspace', t) as WorkspaceRowPresentation
    },
    session: (id, base) => {
      const snapshot = store.getSnapshot()
      const resolution = resolveVaultTarget(snapshot, { type: 'session', id })
      if (resolution.kind === 'plain' || (resolution.kind === 'protected' && snapshot.host === 'ready' && snapshot.unlockedGroupIds.has(resolution.groupId))) return base
      if (snapshot.policy.lockedNameVisibility === 'all-visible') return base
      return conceal('session', t) as SessionRowPresentation
    },
  }
}
