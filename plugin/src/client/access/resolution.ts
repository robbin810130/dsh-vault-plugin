import type { ProtectionBinding, VaultTarget } from '../../shared/contracts.js'
import type { VaultClientSnapshot } from '../store-types.js'

export type VaultProtectionResolution =
  | { readonly kind: 'plain' }
  | { readonly kind: 'protected'; readonly groupId: string }
  | { readonly kind: 'blocked'; readonly reason: string }

function directGroup(binding: ProtectionBinding | undefined): string | undefined {
  return binding?.mode === 'direct' ? binding.passwordGroupId : undefined
}

function groupState(snapshot: VaultClientSnapshot, groupId: string): VaultProtectionResolution {
  if (!snapshot.groups.some(group => group.id === groupId)) return { kind: 'blocked', reason: 'invalid protection binding' }
  return { kind: 'protected', groupId }
}

function workspaceGroup(snapshot: VaultClientSnapshot, workspaceId: string | undefined): VaultProtectionResolution {
  if (workspaceId === undefined) return { kind: 'plain' }
  const binding = snapshot.bindings.find(candidate => candidate.targetType === 'workspace' && candidate.targetId === workspaceId)
  if (binding === undefined) return { kind: 'plain' }
  const groupId = directGroup(binding)
  return groupId === undefined ? { kind: 'blocked', reason: 'invalid workspace binding' } : groupState(snapshot, groupId)
}

export function resolveVaultTarget(snapshot: VaultClientSnapshot, target: VaultTarget): VaultProtectionResolution {
  if (target.type === 'workspace') return workspaceGroup(snapshot, target.id)

  const sessionBindings = snapshot.bindings.filter(candidate => candidate.targetType === 'session' && candidate.targetId === target.id)
  const direct = sessionBindings.find(candidate => candidate.mode === 'direct')
  const directGroupId = directGroup(direct)
  if (direct !== undefined) {
    return directGroupId === undefined ? { kind: 'blocked', reason: 'invalid session binding' } : groupState(snapshot, directGroupId)
  }
  if (sessionBindings.some(candidate => candidate.mode === 'no-inherit')) return { kind: 'plain' }
  if (sessionBindings.some(candidate => candidate.mode === 'inherit')) {
    if (target.workspaceId === undefined) return { kind: 'blocked', reason: 'invalid session binding' }
    return workspaceGroup(snapshot, target.workspaceId)
  }
  return { kind: 'plain' }
}
