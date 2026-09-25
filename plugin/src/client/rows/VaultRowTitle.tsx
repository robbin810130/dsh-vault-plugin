import type { ReactNode } from 'react'
import type { VaultClientStore } from '../store-types.js'
import { useVaultSnapshot } from '../unlock/controller.js'
import { createVaultRowDecorator } from './presentation.js'

function Title({ label, concealed }: { readonly label: string; readonly concealed: boolean }): ReactNode {
  return <span aria-label={label} data-vault-concealed={concealed || undefined}>{label}</span>
}

export function VaultWorkspaceRowTitle({ workspaceId, displayTitle, store }: {
  readonly workspaceId: string
  readonly displayTitle: string
  readonly store?: VaultClientStore
}) {
  useVaultSnapshot(store)
  const view = store === undefined ? undefined : createVaultRowDecorator(store, () => '受保护工作区').workspace?.(workspaceId, {
    label: displayTitle, ariaLabel: displayTitle, concealed: false,
  })
  return <Title label={view?.label ?? '受保护工作区'} concealed={view?.concealed ?? true} />
}

export function VaultSessionRowTitle({ sessionId, workspaceId, displayTitle, store }: {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly displayTitle: string
  readonly store?: VaultClientStore
}) {
  useVaultSnapshot(store)
  const view = store === undefined ? undefined : createVaultRowDecorator(store, () => '受保护对话').session?.(sessionId, {
    label: displayTitle, ariaLabel: displayTitle, concealed: false,
  }, workspaceId)
  return <Title label={view?.label ?? '受保护对话'} concealed={view?.concealed ?? true} />
}

export function VaultBreadcrumbTitle({ lineageSessionId, displayTitle, workspaceId: currentWorkspaceId, currentSessionId, store }: {
  readonly lineageSessionId: string
  readonly displayTitle: string
  readonly workspaceId?: string
  readonly currentSessionId?: string
  readonly store?: VaultClientStore
}) {
  useVaultSnapshot(store)
  const workspaceId = lineageSessionId === currentSessionId ? currentWorkspaceId : undefined
  const view = store === undefined ? undefined : createVaultRowDecorator(store, () => '受保护对话').session?.(lineageSessionId, {
    label: displayTitle, ariaLabel: displayTitle, concealed: false,
  }, workspaceId)
  return <>{view?.label ?? '受保护对话'}</>
}
