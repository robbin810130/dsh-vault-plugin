import type { BindingMutation, ProtectionBinding } from '../../shared/contracts.js'
import type { VaultState } from '../state/model.js'

function missingGroup(groupId: string): TypeError {
  return new TypeError(`Missing password group: ${groupId}`)
}

function assertBinding(binding: ProtectionBinding, state: VaultState): void {
  if (binding.targetId.length === 0) throw new TypeError('Binding target id must not be empty')
  if (binding.targetType === 'workspace') {
    if (binding.mode !== 'direct') {
      throw new TypeError('Workspace binding must use direct mode')
    }
    if (binding.workspaceId !== undefined) {
      throw new TypeError('Workspace binding must not include workspaceId')
    }
  }

  if (binding.mode === 'direct') {
    if (binding.passwordGroupId === undefined) {
      throw new TypeError('Direct binding requires a password group id')
    }
    if (state.groups[binding.passwordGroupId] === undefined) {
      throw missingGroup(binding.passwordGroupId)
    }
    return
  }

  if (binding.passwordGroupId !== undefined) {
    throw new TypeError(`${binding.mode} binding must not include a password group id`)
  }
}

function replaceBinding(
  bindings: readonly ProtectionBinding[],
  replacement: ProtectionBinding,
): readonly ProtectionBinding[] {
  const matches = (binding: ProtectionBinding): boolean => (
    binding.targetType === replacement.targetType && binding.targetId === replacement.targetId
  )
  const firstIndex = bindings.findIndex(matches)
  if (firstIndex === -1) return [...bindings, replacement]

  return bindings.flatMap((binding, index) => {
    if (!matches(binding)) return [binding]
    return index === firstIndex ? [replacement] : []
  })
}

function deleteGroup(
  state: VaultState,
  mutation: Extract<BindingMutation, { kind: 'delete-group' }>,
  now: () => string,
): VaultState {
  if (state.groups[mutation.groupId] === undefined) throw missingGroup(mutation.groupId)

  const targetGroupId = mutation.moveToGroupId
  const movesMembers = targetGroupId !== undefined
  const removesProtection = mutation.removeProtection === true
  if (movesMembers === removesProtection) {
    throw new TypeError('Group deletion requires exactly one of moveToGroupId or removeProtection')
  }

  if (movesMembers) {
    if (targetGroupId === mutation.groupId) {
      throw new TypeError('Group deletion cannot migrate members to the group being deleted')
    }
    if (state.groups[targetGroupId] === undefined) throw missingGroup(targetGroupId)
  }

  const groups = { ...state.groups }
  delete groups[mutation.groupId]
  let bindings: readonly ProtectionBinding[]
  if (movesMembers) {
    const updatedAt = now()
    bindings = state.bindings.map((binding) => (
      binding.passwordGroupId === mutation.groupId
        ? { ...binding, passwordGroupId: targetGroupId, updatedAt }
        : binding
    ))
  } else {
    bindings = state.bindings.filter((binding) => binding.passwordGroupId !== mutation.groupId)
  }

  return { ...state, revision: state.revision + 1, groups, bindings }
}

export function applyBindingMutation(
  state: VaultState,
  mutation: BindingMutation,
  now: () => string,
): VaultState {
  if (mutation.kind === 'delete-group') return deleteGroup(state, mutation, now)

  if (mutation.kind === 'replace') {
    assertBinding(mutation.binding, state)
    return {
      ...state,
      revision: state.revision + 1,
      bindings: replaceBinding(state.bindings, mutation.binding),
    }
  }

  return {
    ...state,
    revision: state.revision + 1,
    bindings: state.bindings.filter((binding) => !(
      binding.targetType === mutation.targetType && binding.targetId === mutation.targetId
    )),
  }
}
