import { useEffect } from 'react'
import type { VaultClientStore } from '../store-types.js'
import { createVaultRowDecorator } from './presentation.js'
import { useVaultSnapshot } from '../unlock/controller.js'

export function VaultDocumentTitle({ sessionId, displayTitle, productTitle, workspaceForSession, store }: {
  readonly sessionId?: string
  readonly displayTitle?: string
  readonly productTitle: string
  readonly workspaceForSession?: (sessionId: string) => string | undefined
  readonly store?: VaultClientStore
}) {
  const snapshot = useVaultSnapshot(store)
  const workspaceId = sessionId === undefined ? undefined : workspaceForSession?.(sessionId)
  const presentation = sessionId === undefined || displayTitle === undefined || store === undefined
    ? undefined
    : createVaultRowDecorator(store, () => '受保护对话').session?.(sessionId, {
      label: displayTitle, ariaLabel: displayTitle, concealed: false,
    }, workspaceId)
  const concealed = sessionId !== undefined && (
    snapshot?.host !== 'ready' || presentation?.concealed !== false
  )
  const title = sessionId === undefined
    ? productTitle
    : `${concealed ? '受保护对话' : displayTitle ?? '受保护对话'} — ${productTitle}`
  useEffect(() => {
    document.title = title
  }, [title])
  return null
}
