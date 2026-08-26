import { useSyncExternalStore } from 'react'
import type { VaultClientSnapshot, VaultClientStore } from '../store-types.js'

export function useVaultSnapshot(store: VaultClientStore): VaultClientSnapshot {
  return useSyncExternalStore(store.subscribe.bind(store), store.getSnapshot.bind(store), store.getSnapshot.bind(store))
}

export function safeAction<T>(action: () => Promise<T>): Promise<T> {
  return action().catch(error => {
    throw error instanceof Error ? error : new Error('Vault operation failed')
  })
}
