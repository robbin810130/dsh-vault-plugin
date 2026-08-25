import type { ProtectionBinding } from '../../shared/contracts.js'

export type EffectiveProtection =
  | { readonly protected: false }
  | {
    readonly protected: true
    readonly groupId: string
    readonly source: 'workspace' | 'session'
  }

function directGroup(binding: ProtectionBinding | undefined): string | undefined {
  if (binding?.mode !== 'direct') return undefined
  return binding.passwordGroupId
}

export function resolveSessionProtection(
  sessionId: string,
  workspaceId: string | undefined,
  bindings: readonly ProtectionBinding[],
): EffectiveProtection {
  const sessionBindings = bindings.filter((binding) => (
    binding.targetType === 'session' && binding.targetId === sessionId
  ))
  const sessionGroupId = directGroup(sessionBindings.find((binding) => binding.mode === 'direct'))

  if (sessionGroupId !== undefined) {
    return { protected: true, groupId: sessionGroupId, source: 'session' }
  }

  if (sessionBindings.some((binding) => binding.mode === 'no-inherit')) {
    return { protected: false }
  }

  if (workspaceId !== undefined) {
    const workspaceGroupId = directGroup(bindings.find((binding) => (
      binding.targetType === 'workspace'
      && binding.targetId === workspaceId
      && binding.mode === 'direct'
    )))
    if (workspaceGroupId !== undefined) {
      return { protected: true, groupId: workspaceGroupId, source: 'workspace' }
    }
  }

  return { protected: false }
}
