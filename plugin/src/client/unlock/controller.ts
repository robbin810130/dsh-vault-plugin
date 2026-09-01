import type { VaultTarget } from '../../shared/contracts.js'
import { useSyncExternalStore } from 'react'
import { resolveVaultTarget } from '../access/resolution.js'
import type { VaultClientSnapshot, VaultClientStore } from '../store-types.js'

let activeStore: VaultClientStore | undefined

export function createVaultUnlockController(store: VaultClientStore): {
  attach(): void
  detach(): void
  getStore(): VaultClientStore | undefined
} {
  return {
    attach() {
      activeStore = store
    },
    detach() {
      if (activeStore === store) activeStore = undefined
    },
    getStore() {
      return activeStore
    },
  }
}

export function useVaultStore(explicit?: VaultClientStore): VaultClientStore | undefined {
  return explicit ?? activeStore
}

export function useVaultSnapshot(store: VaultClientStore | undefined): VaultClientSnapshot | undefined {
  return useSyncExternalStore(
    // Tolerate partial stores (tests, host-provided fakes) that cannot subscribe.
    listener => (typeof store?.subscribe === 'function' ? store.subscribe(listener) : () => undefined),
    () => store?.getSnapshot(),
    () => store?.getSnapshot(),
  )
}

export interface ResolvedRowLockState {
  readonly locked: boolean
  readonly inherited: boolean
  readonly groupId?: string
}

function sessionInherited(snapshot: ReturnType<VaultClientStore['getSnapshot']>, sessionId: string, workspaceId?: string): boolean {
  const direct = snapshot.bindings.find(binding => binding.targetType === 'session' && binding.targetId === sessionId && binding.mode === 'direct')
  if (direct !== undefined) return false
  if (snapshot.bindings.some(binding => binding.targetType === 'session' && binding.targetId === sessionId && binding.mode === 'inherit')) return true
  return workspaceId !== undefined
}

export function resolveRowLockState(
  store: VaultClientStore | undefined,
  kind?: 'workspace' | 'session',
  workspaceId?: string,
  sessionId?: string,
): ResolvedRowLockState {
  if (store === undefined || kind === undefined) return { locked: false, inherited: false }
  const snapshot = store.getSnapshot()
  const target: VaultTarget | undefined = kind === 'workspace'
    ? (workspaceId === undefined ? undefined : { type: 'workspace', id: workspaceId })
    : (sessionId === undefined ? undefined : { type: 'session', id: sessionId, ...(workspaceId === undefined ? {} : { workspaceId }) })
  if (target === undefined) return { locked: false, inherited: false }
  const resolution = resolveVaultTarget(snapshot, target)
  if (resolution.kind !== 'protected' || snapshot.host !== 'ready' || store.hasUnlockedGroup(resolution.groupId)) {
    return { locked: false, inherited: false, ...(resolution.kind === 'protected' ? { groupId: resolution.groupId } : {}) }
  }
  return {
    locked: true,
    inherited: kind === 'session' && sessionId !== undefined ? sessionInherited(snapshot, sessionId, workspaceId) : false,
    groupId: resolution.groupId,
  }
}

export function resolvePromptSnapshot(snapshot: VaultClientSnapshot | undefined) {
  if (snapshot?.prompt === null || snapshot?.prompt === undefined) return null
  const resolution = resolveVaultTarget(snapshot, snapshot.prompt.target)
  return {
    snapshot,
    prompt: snapshot.prompt,
    resolution,
  }
}

export function resolvePrompt(store: VaultClientStore | undefined) {
  return resolvePromptSnapshot(store?.getSnapshot())
}

export function unlockMessage(code?: string, retryAt?: number): string {
  if (code === 'invalid-credentials') return '密码不正确，请重试'
  if (code === 'cooldown') {
    if (retryAt === undefined) return '尝试过于频繁，请稍后重试'
    const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))
    return `尝试过于频繁，请在 ${seconds} 秒后重试`
  }
  if (code === 'host-unavailable' || code === 'invalid-response' || code === 'request-aborted') {
    return '保险箱暂时不可用，请稍后重试'
  }
  return '解锁失败，请重试'
}
