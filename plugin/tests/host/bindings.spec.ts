import { describe, expect, it } from 'vitest'
import type { ProtectionBinding } from '../../src/shared/contracts.js'
import type { PasswordGroup, VaultState } from '../../src/host/state/model.js'
import { applyBindingMutation } from '../../src/host/bindings/mutations.js'
import { resolveSessionProtection } from '../../src/host/bindings/resolver.js'

const NOW = '2026-08-25T00:00:00.000Z'
const MUTATED_AT = '2026-08-25T12:34:56.789Z'
const clock = () => MUTATED_AT

function binding(
  targetType: ProtectionBinding['targetType'],
  targetId: string,
  mode: ProtectionBinding['mode'],
  passwordGroupId?: string,
  workspaceId?: string,
): ProtectionBinding {
  return {
    targetType,
    targetId,
    mode,
    ...(passwordGroupId === undefined ? {} : { passwordGroupId }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function group(id: string): PasswordGroup {
  const verifier = {
    salt: Buffer.alloc(16, id).toString('base64'),
    verifier: Buffer.alloc(32, id).toString('base64'),
    kdf: 'scrypt' as const,
    parameters: { cost: 32768, blockSize: 8, parallelization: 1, keyLength: 32 } as const,
  }
  return {
    id,
    name: id,
    password: verifier,
    recovery: { ...verifier, generatedAt: NOW },
    credentialVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function state(bindings: readonly ProtectionBinding[], groupIds = ['alpha', 'beta']): VaultState {
  return {
    schemaVersion: 1,
    revision: 7,
    groups: Object.fromEntries(groupIds.map((id) => [id, group(id)])),
    bindings,
  }
}

describe('resolveSessionProtection', () => {
  it('prefers a direct session binding over no-inherit and workspace inheritance', () => {
    const bindings = [
      binding('workspace', 'workspace-a', 'direct', 'alpha'),
      binding('session', 'session-a', 'no-inherit'),
      binding('session', 'session-a', 'direct', 'beta'),
    ]

    expect(resolveSessionProtection('session-a', 'workspace-a', bindings)).toEqual({
      protected: true,
      groupId: 'beta',
      source: 'session',
    })
  })

  it('uses no-inherit before current workspace inheritance', () => {
    const bindings = [
      binding('workspace', 'workspace-a', 'direct', 'alpha'),
      binding('session', 'session-a', 'no-inherit'),
    ]

    expect(resolveSessionProtection('session-a', 'workspace-a', bindings)).toEqual({ protected: false })
  })

  it('inherits from the current workspace and leaves a plain session unprotected', () => {
    const bindings = [binding('workspace', 'workspace-a', 'direct', 'alpha')]

    expect(resolveSessionProtection('session-a', 'workspace-a', bindings)).toEqual({
      protected: true,
      groupId: 'alpha',
      source: 'workspace',
    })
    expect(resolveSessionProtection('session-b', undefined, bindings)).toEqual({ protected: false })
  })

  it('re-resolves a moved inherited session from its current workspace stable id', () => {
    const bindings = [
      binding('workspace', 'workspace-old', 'direct', 'alpha'),
      binding('workspace', 'workspace-new', 'direct', 'beta'),
      binding('session', 'session-a', 'inherit', undefined, 'workspace-old'),
    ]

    expect(resolveSessionProtection('session-a', 'workspace-new', bindings)).toEqual({
      protected: true,
      groupId: 'beta',
      source: 'workspace',
    })
  })

  it('keeps a moved direct session attached to its direct group', () => {
    const bindings = [
      binding('workspace', 'workspace-new', 'direct', 'alpha'),
      binding('session', 'session-a', 'direct', 'beta', 'workspace-old'),
    ]

    expect(resolveSessionProtection('session-a', 'workspace-new', bindings)).toEqual({
      protected: true,
      groupId: 'beta',
      source: 'session',
    })
  })

  it('restores a soft-orphaned workspace binding when the stable id appears again', () => {
    const bindings = [binding('workspace', 'workspace-restored', 'direct', 'alpha')]

    expect(resolveSessionProtection('session-a', undefined, bindings)).toEqual({ protected: false })
    expect(resolveSessionProtection('session-a', 'workspace-restored', bindings)).toEqual({
      protected: true,
      groupId: 'alpha',
      source: 'workspace',
    })
  })
})

describe('applyBindingMutation', () => {
  it.each([
    binding('workspace', 'workspace-a', 'inherit'),
    binding('workspace', 'workspace-a', 'no-inherit'),
    binding('workspace', 'workspace-a', 'direct', 'alpha', 'workspace-parent'),
  ])('refuses invalid workspace binding shape %#', (invalidBinding) => {
    const original = state([])

    expect(() => applyBindingMutation(original, {
      kind: 'replace',
      binding: invalidBinding,
    }, clock)).toThrow(/workspace.*direct|workspaceId/i)
    expect(original.bindings).toEqual([])
  })

  it('refuses replacement with a missing password group without mutating the input', () => {
    const original = state([binding('workspace', 'workspace-a', 'direct', 'alpha')])

    expect(() => applyBindingMutation(original, {
      kind: 'replace',
      binding: binding('session', 'session-a', 'direct', 'missing'),
    }, clock)).toThrow(/missing.*group/i)
    expect(original).toEqual(state([binding('workspace', 'workspace-a', 'direct', 'alpha')]))
  })

  it('requires an explicit migration or removeProtection choice for group deletion', () => {
    const original = state([binding('session', 'session-a', 'direct', 'alpha')])

    expect(() => applyBindingMutation(original, { kind: 'delete-group', groupId: 'alpha' }, clock)).toThrow(/moveToGroupId|removeProtection/)
    expect(original.groups.alpha).toBeDefined()
    expect(original.bindings).toHaveLength(1)
  })

  it('rejects missing, ambiguous, and partial group deletion atomically', () => {
    const original = state([binding('session', 'session-a', 'direct', 'alpha')])

    expect(() => applyBindingMutation(original, {
      kind: 'delete-group',
      groupId: 'alpha',
      moveToGroupId: 'beta',
      removeProtection: true,
    }, clock)).toThrow(/exactly one|ambiguous/i)
    expect(() => applyBindingMutation(original, {
      kind: 'delete-group',
      groupId: 'missing',
      removeProtection: true,
    }, clock)).toThrow(/missing.*group/i)
    expect(() => applyBindingMutation(original, {
      kind: 'delete-group',
      groupId: 'alpha',
      moveToGroupId: 'missing',
    }, clock)).toThrow(/missing.*group/i)
    expect(original.groups.alpha).toBeDefined()
    expect(original.bindings[0]?.passwordGroupId).toBe('alpha')
  })

  it('migrates every member by stable group id and preserves archived and soft-orphan bindings', () => {
    const archivedSession = binding('session', 'archived-session', 'direct', 'alpha', 'deleted-workspace')
    const softOrphanWorkspace = binding('workspace', 'soft-orphan-workspace', 'direct', 'alpha')
    const unrelated = binding('session', 'session-b', 'no-inherit')

    const next = applyBindingMutation(state([archivedSession, softOrphanWorkspace, unrelated]), {
      kind: 'delete-group',
      groupId: 'alpha',
      moveToGroupId: 'beta',
    }, clock)

    expect(next.revision).toBe(8)
    expect(next.groups.alpha).toBeUndefined()
    expect(next.groups.beta).toBeDefined()
    expect(next.bindings).toEqual([
      { ...archivedSession, passwordGroupId: 'beta', createdAt: NOW, updatedAt: MUTATED_AT },
      { ...softOrphanWorkspace, passwordGroupId: 'beta', createdAt: NOW, updatedAt: MUTATED_AT },
      unrelated,
    ])
  })

  it('removes protection members when explicitly deleting a group', () => {
    const unrelated = binding('session', 'session-b', 'no-inherit')
    const next = applyBindingMutation(state([
      binding('session', 'archived-session', 'direct', 'alpha'),
      binding('workspace', 'soft-orphan-workspace', 'direct', 'alpha'),
      unrelated,
    ]), {
      kind: 'delete-group',
      groupId: 'alpha',
      removeProtection: true,
    }, clock)

    expect(next.groups.alpha).toBeUndefined()
    expect(next.bindings).toEqual([unrelated])
  })

  it('removing a workspace binding never removes a direct session binding', () => {
    const directSession = binding('session', 'session-a', 'direct', 'beta', 'workspace-a')
    const next = applyBindingMutation(state([
      binding('workspace', 'workspace-a', 'direct', 'alpha'),
      directSession,
    ]), {
      kind: 'remove',
      targetType: 'workspace',
      targetId: 'workspace-a',
    }, clock)

    expect(next.bindings).toEqual([directSession])
  })

  it('replaces by target type and stable target id while retaining unrelated archived bindings', () => {
    const archivedSession = binding('session', 'archived-session', 'direct', 'alpha')
    const replacement = binding('workspace', 'workspace-a', 'direct', 'beta')
    const next = applyBindingMutation(state([
      binding('workspace', 'workspace-a', 'direct', 'alpha'),
      archivedSession,
    ]), { kind: 'replace', binding: replacement }, clock)

    expect(next.bindings).toEqual([replacement, archivedSession])
  })
})
