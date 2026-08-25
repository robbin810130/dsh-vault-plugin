import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VaultPolicy } from '../../src/config.js'
import type { BindingMutation, CreateGroupInput, GrantProof, VaultApiRequest } from '../../src/shared/contracts.js'
import { FailedAttemptStore } from '../../src/host/auth/attempts.js'
import { InMemoryGrantStore } from '../../src/host/auth/grants.js'
import { VaultService } from '../../src/host/service.js'
import { VaultStateRepository } from '../../src/host/state/repository.js'

const policy: VaultPolicy = {
  autoLockMinutes: 0,
  lockOnSystemSleep: true,
  lockedNameVisibility: 'workspace-visible-session-hidden',
  failedAttemptProtection: { enabled: true, maxAttempts: 2, cooldownSeconds: 10 },
}

function groupCreateRequest(
  expectedRevision: number,
  input: CreateGroupInput,
  grants: readonly GrantProof[] = [],
  clientInstanceId = 'client-1',
): Extract<VaultApiRequest, { action: 'group-create' }> {
  return { action: 'group-create', clientInstanceId, expectedRevision, grants, input }
}

function bindingsUpdateRequest(
  expectedRevision: number,
  input: BindingMutation,
  grants: readonly GrantProof[] = [],
  clientInstanceId = 'client-1',
): Extract<VaultApiRequest, { action: 'bindings-update' }> {
  return { action: 'bindings-update', clientInstanceId, expectedRevision, grants, input }
}

describe('VaultService', () => {
  let root: string
  let service: VaultService

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'dsh-vault-service-'))
    service = new VaultService({
      repository: new VaultStateRepository(join(root, 'vault-lock')),
      policy,
      grants: new InMemoryGrantStore({ monotonicNow: () => 100, wallNow: () => 1_000 }),
      attempts: new FailedAttemptStore({ monotonicNow: () => 100, wallNow: () => 1_000 }),
      now: () => '2026-08-25T00:00:00.000Z',
    })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('returns a redacted snapshot and unlocks with a client-bound grant', async () => {
    const created = await service.handle(groupCreateRequest(0, {
      name: 'Primary', password: 'correct horse', bindings: [],
    }))

    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.recoveryKey).toMatch(/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){12}$/)
    expect(JSON.stringify(created.value.snapshot)).not.toContain('correct horse')

    const unlocked = await service.handle({
      action: 'unlock', clientInstanceId: 'client-1', groupId: created.value.snapshot.groups[0]!.id, password: 'correct horse',
    })
    expect(unlocked.ok).toBe(true)
    if (!unlocked.ok) return
    expect(unlocked.value.grant).toMatchObject({ groupId: created.value.snapshot.groups[0]!.id, credentialVersion: 1 })
    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: true })
    expect(service.validateGrants('client-2', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('does not issue a grant or recovery key when durable create fails', async () => {
    const repository = new VaultStateRepository(join(root, 'vault-lock'))
    const failing = new VaultService({
      repository: {
        load: () => repository.load(),
        commit: async () => { throw new Error('disk full') },
        appendAudit: () => Promise.resolve(),
      },
      policy,
      grants: new InMemoryGrantStore(),
      attempts: new FailedAttemptStore(),
    })

    const result = await failing.handle(groupCreateRequest(0, {
      name: 'Primary', password: 'correct horse', bindings: [],
    }))

    expect(result).toEqual({ ok: false, error: { code: 'persistence-failed', message: 'Vault operation failed' } })
  })

  it('enforces failed-attempt cooldown and clears it after a successful unlock', async () => {
    await service.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    const snapshot = await service.snapshot()
    const groupId = snapshot.groups[0]!.id

    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'wrong horse' })).resolves.toMatchObject({ ok: false, error: { code: 'invalid-credentials' } })
    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'wrong horse' })).resolves.toMatchObject({ ok: false, error: { code: 'cooldown' } })
  })

  it('touches each client at most once per 60 seconds and supports lock lifecycle', async () => {
    await service.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    const snapshot = await service.snapshot()
    const groupId = snapshot.groups[0]!.id
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!unlocked.ok) throw new Error('unlock failed')
    const proof: GrantProof = unlocked.value.grant

    expect(service.touchActivity('client-1', [proof])).toMatchObject({ valid: true, touched: true })
    expect(service.touchActivity('client-1', [proof])).toMatchObject({ valid: true, touched: false })
    expect(service.lockGroup('client-1', groupId)).toEqual({ ok: true, value: null })
    expect(service.validateGrants('client-1', [proof])).toEqual({ valid: false })
  })

  it('does not let lock operations bypass an active failed-attempt cooldown', async () => {
    await service.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    const groupId = (await service.snapshot()).groups[0]!.id
    await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'wrong horse' })
    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'wrong horse' })).resolves.toMatchObject({ ok: false, error: { code: 'cooldown' } })

    expect(service.lockGroup('client-1', groupId)).toEqual({ ok: true, value: null })
    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })).resolves.toMatchObject({ ok: false, error: { code: 'cooldown' } })
    expect(service.lockAll('client-1')).toEqual({ ok: true, value: null })
    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })).resolves.toMatchObject({ ok: false, error: { code: 'cooldown' } })
  })

  it('revokes old and new grants when bindings change or members migrate', async () => {
    const first = await service.handle(groupCreateRequest(0, { name: 'First', password: 'correct horse', bindings: [] }))
    if (!first.ok) throw new Error('first create failed')
    const firstId = first.value.snapshot.groups[0]!.id
    const second = await service.handle(groupCreateRequest(1, { name: 'Second', password: 'second horse', bindings: [] }))
    if (!second.ok) throw new Error('second create failed')
    const secondId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Second')!.id
    const firstBinding = { targetType: 'workspace' as const, targetId: 'workspace-1', mode: 'direct' as const, passwordGroupId: firstId, createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z' }
    const firstSetupGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: firstId, password: 'correct horse' })
    if (!firstSetupGrant.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: firstBinding }, [firstSetupGrant.value.grant]))
    const firstGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: firstId, password: 'correct horse' })
    const secondGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: secondId, password: 'second horse' })
    if (!firstGrant.ok || !secondGrant.ok) throw new Error('unlock failed')
    const secondBinding = { ...firstBinding, passwordGroupId: secondId }
    const replaced = await service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: secondBinding }, [firstGrant.value.grant, secondGrant.value.grant]))
    expect(replaced).toMatchObject({ ok: true })
    expect(service.validateGrants('client-1', [firstGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [secondGrant.value.grant])).toEqual({ valid: false })

    const thirdGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: secondId, password: 'second horse' })
    if (!thirdGrant.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(4, { kind: 'remove', targetType: 'workspace', targetId: 'workspace-1' }, [thirdGrant.value.grant]))
    expect(service.validateGrants('client-1', [thirdGrant.value.grant])).toEqual({ valid: false })

    const migrationFirst = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: firstId, password: 'correct horse' })
    const migrationSecond = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: secondId, password: 'second horse' })
    if (!migrationFirst.ok || !migrationSecond.ok) throw new Error('unlock failed')
    const deleted = await service.handle(bindingsUpdateRequest(5, { kind: 'delete-group', groupId: firstId, moveToGroupId: secondId }, [migrationFirst.value.grant, migrationSecond.value.grant]))
    expect(deleted).toMatchObject({ ok: true })
    expect(service.validateGrants('client-1', [migrationFirst.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [migrationSecond.value.grant])).toEqual({ valid: false })
  })

  it('revokes an inherited workspace grant when a session opts out of inheritance', async () => {
    const created = await service.handle(groupCreateRequest(0, { name: 'Workspace', password: 'workspace horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const workspaceBinding = { targetType: 'workspace' as const, targetId: 'workspace-1', mode: 'direct' as const, passwordGroupId: groupId, createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z' }

    const workspaceSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!workspaceSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(1, { kind: 'replace', binding: workspaceBinding }, [workspaceSetup.value.grant]))
    const inheritSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!inheritSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit', createdAt: workspaceBinding.createdAt, updatedAt: workspaceBinding.updatedAt } }, [inheritSetup.value.grant]))
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    const optedOut = await service.handle(bindingsUpdateRequest(3, {
      kind: 'replace',
      binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'no-inherit', createdAt: workspaceBinding.createdAt, updatedAt: workspaceBinding.updatedAt },
    }, [unlocked.value.grant]))

    expect(optedOut).toMatchObject({ ok: true })
    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('revokes an inherited workspace grant when the session binding is removed', async () => {
    const created = await service.handle(groupCreateRequest(0, { name: 'Workspace', password: 'workspace horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    const workspaceSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!workspaceSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(1, { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: groupId, createdAt: timestamp, updatedAt: timestamp } }, [workspaceSetup.value.grant]))
    const inheritSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!inheritSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit', createdAt: timestamp, updatedAt: timestamp } }, [inheritSetup.value.grant]))
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    await service.handle(bindingsUpdateRequest(3, { kind: 'remove', targetType: 'session', targetId: 'session-1' }, [unlocked.value.grant]))

    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('revokes both direct and inherited grants when a session protection source changes', async () => {
    const first = await service.handle(groupCreateRequest(0, { name: 'Direct', password: 'direct horse', bindings: [] }))
    const second = await service.handle(groupCreateRequest(1, { name: 'Workspace', password: 'workspace horse', bindings: [] }))
    if (!first.ok || !second.ok) throw new Error('create failed')
    const directId = first.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Direct')!.id
    const workspaceId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Workspace')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    const workspaceSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: workspaceId, password: 'workspace horse' })
    if (!workspaceSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: workspaceId, createdAt: timestamp, updatedAt: timestamp } }, [workspaceSetup.value.grant]))
    const inheritedSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: workspaceId, password: 'workspace horse' })
    const directSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directId, password: 'direct horse' })
    if (!inheritedSetup.ok || !directSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'direct', passwordGroupId: directId, createdAt: timestamp, updatedAt: timestamp } }, [inheritedSetup.value.grant, directSetup.value.grant]))
    const directGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directId, password: 'direct horse' })
    const inheritedGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: workspaceId, password: 'workspace horse' })
    if (!directGrant.ok || !inheritedGrant.ok) throw new Error('unlock failed')

    await service.handle(bindingsUpdateRequest(4, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit', createdAt: timestamp, updatedAt: timestamp } }, [directGrant.value.grant, inheritedGrant.value.grant]))

    expect(service.validateGrants('client-1', [directGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [inheritedGrant.value.grant])).toEqual({ valid: false })
  })

  it('revokes grants for both sides of a workspace binding replacement', async () => {
    const first = await service.handle(groupCreateRequest(0, { name: 'Old', password: 'old horse', bindings: [] }))
    const second = await service.handle(groupCreateRequest(1, { name: 'New', password: 'new horse', bindings: [] }))
    if (!first.ok || !second.ok) throw new Error('create failed')
    const oldId = first.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Old')!.id
    const newId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'New')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    const oldSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: oldId, password: 'old horse' })
    if (!oldSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: oldId, createdAt: timestamp, updatedAt: timestamp } }, [oldSetup.value.grant]))
    const inheritSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: oldId, password: 'old horse' })
    if (!inheritSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit', createdAt: timestamp, updatedAt: timestamp } }, [inheritSetup.value.grant]))
    const oldGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: oldId, password: 'old horse' })
    const newGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: newId, password: 'new horse' })
    if (!oldGrant.ok || !newGrant.ok) throw new Error('unlock failed')

    await service.handle(bindingsUpdateRequest(4, { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: newId, createdAt: timestamp, updatedAt: timestamp } }, [oldGrant.value.grant, newGrant.value.grant]))

    expect(service.validateGrants('client-1', [oldGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [newGrant.value.grant])).toEqual({ valid: false })
  })

  it('revokes implicit workspace grants when adding a session no-inherit binding', async () => {
    const created = await service.handle(groupCreateRequest(0, { name: 'Workspace', password: 'workspace horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    const workspaceSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!workspaceSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(1, { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: groupId, createdAt: timestamp, updatedAt: timestamp } }, [workspaceSetup.value.grant]))
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'no-inherit', createdAt: timestamp, updatedAt: timestamp } }, [unlocked.value.grant]))

    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('revokes implicit old and direct new grants when adding a direct session binding', async () => {
    const first = await service.handle(groupCreateRequest(0, { name: 'Implicit', password: 'implicit horse', bindings: [] }))
    const second = await service.handle(groupCreateRequest(1, { name: 'Direct', password: 'direct horse', bindings: [] }))
    if (!first.ok || !second.ok) throw new Error('create failed')
    const implicitId = first.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Implicit')!.id
    const directId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Direct')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    const workspaceSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: implicitId, password: 'implicit horse' })
    if (!workspaceSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: implicitId, createdAt: timestamp, updatedAt: timestamp } }, [workspaceSetup.value.grant]))
    const implicitGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: implicitId, password: 'implicit horse' })
    const directGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directId, password: 'direct horse' })
    if (!implicitGrant.ok || !directGrant.ok) throw new Error('unlock failed')

    await service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'direct', passwordGroupId: directId, createdAt: timestamp, updatedAt: timestamp } }, [implicitGrant.value.grant, directGrant.value.grant]))

    expect(service.validateGrants('client-1', [implicitGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [directGrant.value.grant])).toEqual({ valid: false })
  })

  it('revokes direct old and implicit new grants when removing a direct session binding', async () => {
    const first = await service.handle(groupCreateRequest(0, { name: 'Implicit', password: 'implicit horse', bindings: [] }))
    const second = await service.handle(groupCreateRequest(1, { name: 'Direct', password: 'direct horse', bindings: [] }))
    if (!first.ok || !second.ok) throw new Error('create failed')
    const implicitId = first.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Implicit')!.id
    const directId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Direct')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    const workspaceSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: implicitId, password: 'implicit horse' })
    if (!workspaceSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: implicitId, createdAt: timestamp, updatedAt: timestamp } }, [workspaceSetup.value.grant]))
    const implicitSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: implicitId, password: 'implicit horse' })
    const directSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directId, password: 'direct horse' })
    if (!implicitSetup.ok || !directSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'direct', passwordGroupId: directId, createdAt: timestamp, updatedAt: timestamp } }, [implicitSetup.value.grant, directSetup.value.grant]))
    const implicitGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: implicitId, password: 'implicit horse' })
    const directGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directId, password: 'direct horse' })
    if (!implicitGrant.ok || !directGrant.ok) throw new Error('unlock failed')

    await service.handle(bindingsUpdateRequest(4, { kind: 'remove', targetType: 'session', targetId: 'session-1' }, [implicitGrant.value.grant, directGrant.value.grant]))

    expect(service.validateGrants('client-1', [implicitGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [directGrant.value.grant])).toEqual({ valid: false })
  })

  it('revokes the implicit workspace grant restored by removing no-inherit', async () => {
    const created = await service.handle(groupCreateRequest(0, { name: 'Workspace', password: 'workspace horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    const workspaceSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!workspaceSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(1, { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: groupId, createdAt: timestamp, updatedAt: timestamp } }, [workspaceSetup.value.grant]))
    const noInheritSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!noInheritSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'no-inherit', createdAt: timestamp, updatedAt: timestamp } }, [noInheritSetup.value.grant]))
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    await service.handle(bindingsUpdateRequest(3, { kind: 'remove', targetType: 'session', targetId: 'session-1' }, [unlocked.value.grant]))

    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('keeps durable create/change/recover results successful when audit append fails', async () => {
    let auditCalls = 0
    const repository = new VaultStateRepository(join(root, 'audit-fault-vault'))
    const auditFault = {
      load: () => repository.load(),
      commit: (expectedRevision: number, next: Parameters<typeof repository.commit>[1]) => repository.commit(expectedRevision, next),
      appendAudit: async () => { auditCalls += 1; throw new Error('audit unavailable') },
    }
    const audited = new VaultService({ repository: auditFault, policy, grants: new InMemoryGrantStore(), attempts: new FailedAttemptStore() })
    const created = await audited.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    expect(created).toMatchObject({ ok: true })
    expect(auditCalls).toBe(1)
    if (!created.ok) return
    const groupId = created.value.snapshot.groups[0]!.id
    const changed = await audited.handle({ action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 1, input: { groupId, currentPassword: 'correct horse', newPassword: 'new horse', rotateRecovery: true } })
    expect(changed).toMatchObject({ ok: true })
    const recovered = await audited.handle({ action: 'group-recover', clientInstanceId: 'client-1', expectedRevision: 2, input: { groupId, recoveryKey: changed.ok && 'recoveryKey' in changed.value ? changed.value.recoveryKey : 'invalid', newPassword: 'recovered horse' } })
    expect(recovered).toMatchObject({ ok: true })
  })

  it('returns a revision conflict without changing the snapshot', async () => {
    const result = await service.handle(groupCreateRequest(9, { name: 'Primary', password: 'correct horse', bindings: [] }))
    expect(result).toEqual({ ok: false, error: { code: 'revision-conflict', message: 'Vault revision changed' } })
    expect((await service.snapshot()).revision).toBe(0)
  })

  it('reloads external revisions before snapshots and grant authorization', async () => {
    const external = new VaultStateRepository(join(root, 'vault-lock'))
    const created = await service.handle(groupCreateRequest(0, {
      name: 'Primary', password: 'correct horse', bindings: [],
    }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!unlocked.ok) throw new Error('unlock failed')
    const externalState = await external.load()
    await expect(external.commit(externalState.revision, {
      ...externalState,
      revision: externalState.revision + 1,
      bindings: [],
    })).resolves.toEqual({ ok: true, revision: 2 })

    await expect(service.snapshot()).resolves.toMatchObject({ revision: 2, bindings: [] })
    await expect(service.handle({ action: 'grants-validate', clientInstanceId: 'client-1', grants: [unlocked.value.grant] }))
      .resolves.toEqual({ ok: true, value: { valid: false } })
  })

  it('fails closed and revokes grants when same-revision external state differs', async () => {
    const created = await service.handle(groupCreateRequest(0, {
      name: 'Primary', password: 'correct horse', bindings: [],
    }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    const external = new VaultStateRepository(join(root, 'vault-lock'))
    const state = await external.load()
    const changed = {
      ...state,
      groups: { ...state.groups, [groupId]: { ...state.groups[groupId]!, name: 'Externally changed' } },
    }
    await fs.writeFile(join(root, 'vault-lock', 'state.json'), JSON.stringify(changed))
    await expect(external.load()).resolves.toMatchObject({ revision: 1, groups: { [groupId]: { name: 'Externally changed' } } })

    await expect(service.handle({ action: 'grants-validate', clientInstanceId: 'client-1', grants: [unlocked.value.grant] }))
      .resolves.toEqual({ ok: false, error: { code: 'operation-failed', message: 'Vault operation failed' } })
    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('fails closed and revokes grants when an external state revision goes backwards', async () => {
    const created = await service.handle(groupCreateRequest(0, {
      name: 'Primary', password: 'correct horse', bindings: [],
    }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    const external = new VaultStateRepository(join(root, 'vault-lock'))
    const state = await external.load()
    await fs.writeFile(join(root, 'vault-lock', 'state.json'), JSON.stringify({ ...state, revision: 0 }))
    await expect(external.load()).resolves.toMatchObject({ revision: 0 })

    await expect(service.handle({ action: 'grants-validate', clientInstanceId: 'client-1', grants: [unlocked.value.grant] }))
      .resolves.toEqual({ ok: false, error: { code: 'operation-failed', message: 'Vault operation failed' } })
    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('reconciles and revokes grants after a revision-conflict reload', async () => {
    const backing = new VaultStateRepository(join(root, 'vault-lock'))
    const seeded = new VaultService({ repository: backing, policy })
    const created = await seeded.handle(groupCreateRequest(0, {
      name: 'Primary', password: 'correct horse', bindings: [],
    }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const external = new VaultStateRepository(join(root, 'vault-lock'))
    let conflictNextCommit = true
    const conflicted = new VaultService({
      repository: {
        load: () => backing.load(),
        commit: async (expectedRevision, next) => {
          if (conflictNextCommit) {
            conflictNextCommit = false
            const current = await external.load()
            await external.commit(current.revision, { ...current, revision: current.revision + 1, bindings: [] })
          }
          return backing.commit(expectedRevision, next)
        },
        appendAudit: (event) => backing.appendAudit(event),
      },
      policy,
    })
    const unlocked = await conflicted.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    await expect(conflicted.handle({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 1,
      input: { groupId, currentPassword: 'correct horse', newPassword: 'new password', rotateRecovery: false },
    })).resolves.toEqual({ ok: false, error: { code: 'revision-conflict', message: 'Vault revision changed' } })
    expect(conflicted.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('fails closed when a state refresh fails after the initial cache', async () => {
    let loads = 0
    const repository = {
      load: async () => {
        loads += 1
        if (loads === 1) return { schemaVersion: 1 as const, revision: 0, groups: {}, bindings: [] }
        throw new Error('state unavailable')
      },
      commit: async () => ({ ok: false as const, code: 'revision-conflict' as const }),
      appendAudit: async () => undefined,
    }
    const failing = new VaultService({ repository, policy })

    await expect(failing.snapshot()).resolves.toMatchObject({ revision: 0 })
    await expect(failing.handle({ action: 'snapshot', clientInstanceId: 'client-1' }))
      .resolves.toEqual({ ok: false, error: { code: 'operation-failed', message: 'Vault operation failed' } })
  })

  it('preserves existing bindings when creating another group', async () => {
    const first = await service.handle(groupCreateRequest(0, { name: 'First', password: 'correct horse', bindings: [] }))
    expect(first.ok).toBe(true)
    const snapshot = await service.snapshot()
    const groupId = snapshot.groups[0]!.id
    const binding = {
      targetType: 'workspace' as const,
      targetId: 'workspace-1',
      mode: 'direct' as const,
      passwordGroupId: groupId,
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    }
    const setupGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!setupGrant.ok) throw new Error('unlock failed')
    const updated = await service.handle(bindingsUpdateRequest(1, { kind: 'replace', binding }, [setupGrant.value.grant]))
    expect(updated.ok).toBe(true)
    const second = await service.handle(groupCreateRequest(2, { name: 'Second', password: 'correct horse', bindings: [] }))
    expect(second.ok).toBe(true)
    expect((await service.snapshot()).bindings).toEqual([binding])
  })

  it('assigns new direct bindings to the newly created group', async () => {
    const result = await service.handle(groupCreateRequest(0, {
      name: 'Primary', password: 'correct horse', bindings: [{
        targetType: 'workspace', targetId: 'workspace-1', mode: 'direct',
        createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
      }],
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.snapshot.bindings[0]?.passwordGroupId).toBe(result.value.snapshot.groups[0]?.id)
  })

  it('rejects duplicate group names without creating another group', async () => {
    await service.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    const result = await service.handle(groupCreateRequest(1, { name: 'Primary', password: 'another horse', bindings: [] }))

    expect(result).toEqual({ ok: false, error: { code: 'duplicate-name', message: 'Vault operation failed' } })
    expect((await service.snapshot()).groups).toHaveLength(1)
  })

  it('returns snapshots that cannot mutate the service state', async () => {
    await service.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    const snapshot = await service.snapshot()
    expect(() => (snapshot.bindings as Array<unknown>).push({ targetType: 'workspace' })).toThrow()
    expect(() => { (snapshot.groups as unknown as Array<{ name: string }>)[0]!.name = 'leaked' }).toThrow()

    const fresh = await service.snapshot()
    expect(fresh.bindings).toEqual([])
    expect(fresh.groups[0]?.name).toBe('Primary')
  })

  it('checks revision before credential details and throttles password changes per client', async () => {
    const created = await service.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id

    const wrongRevision = await service.handle({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 9,
      input: { groupId, currentPassword: 'correct horse', newPassword: 'new horse', rotateRecovery: false },
    } as never)
    expect(wrongRevision).toMatchObject({ ok: false, error: { code: 'revision-conflict' } })

    const wrongCredential = await service.handle({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 1,
      input: { groupId, currentPassword: 'wrong horse', newPassword: 'new horse', rotateRecovery: false },
    } as never)
    expect(wrongCredential).toMatchObject({ ok: false, error: { code: 'invalid-credentials' } })
    const cooldown = await service.handle({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 1,
      input: { groupId, currentPassword: 'wrong horse', newPassword: 'new horse', rotateRecovery: false },
    } as never)
    expect(cooldown).toMatchObject({ ok: false, error: { code: 'cooldown' } })
  })

  it('resets change and recovery failures only after successful credential commits', async () => {
    const created = await service.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const recoveryKey = created.value.recoveryKey

    await service.handle({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 1,
      input: { groupId, currentPassword: 'wrong horse', newPassword: 'new horse', rotateRecovery: false },
    } as never)
    const changed = await service.handle({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 1,
      input: { groupId, currentPassword: 'correct horse', newPassword: 'new horse', rotateRecovery: false },
    } as never)
    expect(changed).toMatchObject({ ok: true })
    const afterChange = await service.handle({
      action: 'group-change-password', clientInstanceId: 'client-1', expectedRevision: 2,
      input: { groupId, currentPassword: 'wrong horse', newPassword: 'third horse', rotateRecovery: false },
    } as never)
    expect(afterChange).toMatchObject({ ok: false, error: { code: 'invalid-credentials' } })

    await service.handle({
      action: 'group-recover', clientInstanceId: 'client-2', expectedRevision: 2,
      input: { groupId, recoveryKey: 'wrong recovery', newPassword: 'recovered horse' },
    } as never)
    const recovered = await service.handle({
      action: 'group-recover', clientInstanceId: 'client-2', expectedRevision: 2,
      input: { groupId, recoveryKey, newPassword: 'recovered horse' },
    } as never)
    expect(recovered).toMatchObject({ ok: true })
  })

  it('rejects a grant proof whose declared credential version is not current', async () => {
    const created = await service.handle(groupCreateRequest(0, {
      name: 'Primary', password: 'correct horse', bindings: [],
    }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const unlocked = await service.handle({
      action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse',
    })
    if (!unlocked.ok) throw new Error('unlock failed')

    expect(service.validateGrants('client-1', [{
      ...unlocked.value.grant,
      credentialVersion: unlocked.value.grant.credentialVersion + 1,
    }])).toEqual({ valid: false })
  })

  it('requires current client-bound grants for every group affected by binding replacement', async () => {
    const oldCreated = await service.handle(groupCreateRequest(0, { name: 'Old', password: 'old horse', bindings: [] }))
    const newCreated = await service.handle(groupCreateRequest(1, { name: 'New', password: 'new horse', bindings: [] }))
    if (!oldCreated.ok || !newCreated.ok) throw new Error('create failed')
    const oldId = oldCreated.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Old')!.id
    const newId = newCreated.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'New')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'
    const oldBinding = { targetType: 'workspace' as const, targetId: 'workspace-1', mode: 'direct' as const, passwordGroupId: oldId, createdAt: timestamp, updatedAt: timestamp }
    const oldSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: oldId, password: 'old horse' })
    if (!oldSetup.ok) throw new Error('unlock failed')
    await expect(service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: oldBinding }, [oldSetup.value.grant])))
      .resolves.toMatchObject({ ok: true })

    const oldGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: oldId, password: 'old horse' })
    const newGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: newId, password: 'new horse' })
    if (!oldGrant.ok || !newGrant.ok) throw new Error('unlock failed')
    const replacement = { ...oldBinding, passwordGroupId: newId }
    const before = await service.snapshot()
    const auditPath = join(root, 'vault-lock', 'audit.jsonl')
    const auditBefore = await fs.readFile(auditPath)

    await expect(service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: replacement }, [oldGrant.value.grant])))
      .resolves.toEqual({ ok: false, error: { code: 'invalid-credentials', message: 'Invalid credentials' } })
    await expect(service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: replacement }, [oldGrant.value.grant, newGrant.value.grant], 'client-2')))
      .resolves.toEqual({ ok: false, error: { code: 'invalid-credentials', message: 'Invalid credentials' } })
    await expect(service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: replacement }, [
      oldGrant.value.grant,
      { ...newGrant.value.grant, credentialVersion: newGrant.value.grant.credentialVersion + 1 },
    ]))).resolves.toEqual({ ok: false, error: { code: 'invalid-credentials', message: 'Invalid credentials' } })

    expect(await service.snapshot()).toEqual(before)
    await expect(fs.readFile(auditPath)).resolves.toEqual(auditBefore)
    expect(service.validateGrants('client-1', [oldGrant.value.grant])).toEqual({ valid: true })
    expect(service.validateGrants('client-1', [newGrant.value.grant])).toEqual({ valid: true })

    await expect(service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: replacement }, [oldGrant.value.grant, newGrant.value.grant])))
      .resolves.toMatchObject({ ok: true })
    expect(service.validateGrants('client-1', [oldGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [newGrant.value.grant])).toEqual({ valid: false })
  })

  it('authorizes group creation against overwritten existing protection but not the new group', async () => {
    const oldCreated = await service.handle(groupCreateRequest(0, { name: 'Old', password: 'old horse', bindings: [] }))
    if (!oldCreated.ok) throw new Error('create failed')
    const oldId = oldCreated.value.snapshot.groups[0]!.id
    const timestamp = '2026-08-25T00:00:00.000Z'
    const oldBinding = { targetType: 'workspace' as const, targetId: 'workspace-1', mode: 'direct' as const, passwordGroupId: oldId, createdAt: timestamp, updatedAt: timestamp }
    const setupGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: oldId, password: 'old horse' })
    if (!setupGrant.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(1, { kind: 'replace', binding: oldBinding }, [setupGrant.value.grant]))
    const oldGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: oldId, password: 'old horse' })
    if (!oldGrant.ok) throw new Error('unlock failed')
    const input: CreateGroupInput = {
      name: 'New',
      password: 'new horse',
      bindings: [{ targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', createdAt: timestamp, updatedAt: timestamp }],
    }
    const before = await service.snapshot()
    const auditPath = join(root, 'vault-lock', 'audit.jsonl')
    const auditBefore = await fs.readFile(auditPath)

    await expect(service.handle(groupCreateRequest(2, input)))
      .resolves.toEqual({ ok: false, error: { code: 'invalid-credentials', message: 'Invalid credentials' } })
    expect(await service.snapshot()).toEqual(before)
    await expect(fs.readFile(auditPath)).resolves.toEqual(auditBefore)
    expect(service.validateGrants('client-1', [oldGrant.value.grant])).toEqual({ valid: true })

    const created = await service.handle(groupCreateRequest(2, input, [oldGrant.value.grant]))
    expect(created).toMatchObject({ ok: true })
    if (!created.ok) return
    expect(created.value.snapshot.groups).toHaveLength(2)
    expect(created.value.snapshot.bindings[0]?.passwordGroupId).not.toBe(oldId)
    expect(service.validateGrants('client-1', [oldGrant.value.grant])).toEqual({ valid: false })
  })

  it('requires both direct and inherited groups when a session changes protection source', async () => {
    const workspaceCreated = await service.handle(groupCreateRequest(0, { name: 'Workspace', password: 'workspace horse', bindings: [] }))
    const directCreated = await service.handle(groupCreateRequest(1, { name: 'Direct', password: 'direct horse', bindings: [] }))
    if (!workspaceCreated.ok || !directCreated.ok) throw new Error('create failed')
    const workspaceGroupId = workspaceCreated.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Workspace')!.id
    const directGroupId = directCreated.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Direct')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'
    const workspaceBinding = { targetType: 'workspace' as const, targetId: 'workspace-1', mode: 'direct' as const, passwordGroupId: workspaceGroupId, createdAt: timestamp, updatedAt: timestamp }
    const workspaceSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: workspaceGroupId, password: 'workspace horse' })
    if (!workspaceSetup.ok) throw new Error('unlock failed')
    await service.handle(bindingsUpdateRequest(2, { kind: 'replace', binding: workspaceBinding }, [workspaceSetup.value.grant]))

    const inheritedSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: workspaceGroupId, password: 'workspace horse' })
    const directSetup = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directGroupId, password: 'direct horse' })
    if (!inheritedSetup.ok || !directSetup.ok) throw new Error('unlock failed')
    const directBinding = { targetType: 'session' as const, targetId: 'session-1', workspaceId: 'workspace-1', mode: 'direct' as const, passwordGroupId: directGroupId, createdAt: timestamp, updatedAt: timestamp }
    await service.handle(bindingsUpdateRequest(3, { kind: 'replace', binding: directBinding }, [inheritedSetup.value.grant, directSetup.value.grant]))

    const inheritedGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: workspaceGroupId, password: 'workspace horse' })
    const directGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directGroupId, password: 'direct horse' })
    if (!inheritedGrant.ok || !directGrant.ok) throw new Error('unlock failed')
    const inheritBinding = { targetType: 'session' as const, targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit' as const, createdAt: timestamp, updatedAt: timestamp }

    await expect(service.handle(bindingsUpdateRequest(4, { kind: 'replace', binding: inheritBinding }, [directGrant.value.grant])))
      .resolves.toEqual({ ok: false, error: { code: 'invalid-credentials', message: 'Invalid credentials' } })
    expect((await service.snapshot()).revision).toBe(4)
    expect(service.validateGrants('client-1', [inheritedGrant.value.grant])).toEqual({ valid: true })
    expect(service.validateGrants('client-1', [directGrant.value.grant])).toEqual({ valid: true })

    await expect(service.handle(bindingsUpdateRequest(4, { kind: 'replace', binding: inheritBinding }, [directGrant.value.grant, inheritedGrant.value.grant])))
      .resolves.toMatchObject({ ok: true })
    expect(service.validateGrants('client-1', [inheritedGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [directGrant.value.grant])).toEqual({ valid: false })
  })

  it('requires both source and destination grants before deleting and moving a group', async () => {
    const sourceCreated = await service.handle(groupCreateRequest(0, { name: 'Source', password: 'source horse', bindings: [] }))
    const targetCreated = await service.handle(groupCreateRequest(1, { name: 'Target', password: 'target horse', bindings: [] }))
    if (!sourceCreated.ok || !targetCreated.ok) throw new Error('create failed')
    const sourceId = sourceCreated.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Source')!.id
    const targetId = targetCreated.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Target')!.id
    const sourceGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: sourceId, password: 'source horse' })
    const targetGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: targetId, password: 'target horse' })
    if (!sourceGrant.ok || !targetGrant.ok) throw new Error('unlock failed')
    const mutation = { kind: 'delete-group' as const, groupId: sourceId, moveToGroupId: targetId }

    await expect(service.handle(bindingsUpdateRequest(2, mutation, [sourceGrant.value.grant])))
      .resolves.toEqual({ ok: false, error: { code: 'invalid-credentials', message: 'Invalid credentials' } })
    expect((await service.snapshot()).groups).toHaveLength(2)
    expect(service.validateGrants('client-1', [sourceGrant.value.grant])).toEqual({ valid: true })
    expect(service.validateGrants('client-1', [targetGrant.value.grant])).toEqual({ valid: true })

    await expect(service.handle(bindingsUpdateRequest(2, mutation, [sourceGrant.value.grant, targetGrant.value.grant])))
      .resolves.toMatchObject({ ok: true })
    expect((await service.snapshot()).groups.map((group) => group.id)).toEqual([targetId])
    expect(service.validateGrants('client-1', [sourceGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [targetGrant.value.grant])).toEqual({ valid: false })
  })

  it('allows empty grants when no existing group is affected', async () => {
    await expect(service.handle(groupCreateRequest(0, { name: 'First', password: 'first horse', bindings: [] })))
      .resolves.toMatchObject({ ok: true })
    await expect(service.handle(groupCreateRequest(1, { name: 'Second', password: 'second horse', bindings: [] })))
      .resolves.toMatchObject({ ok: true })
    await expect(service.handle(bindingsUpdateRequest(2, { kind: 'remove', targetType: 'session', targetId: 'missing-session' })))
      .resolves.toMatchObject({ ok: true, value: { revision: 3 } })
  })

  it('clears grants and failed attempts when the initial repository load fails', async () => {
    const grants = new InMemoryGrantStore({ monotonicNow: () => 100, wallNow: () => 1_000 })
    const attempts = new FailedAttemptStore({ monotonicNow: () => 100, wallNow: () => 1_000 })
    const grant = grants.issue('group-1', 1, 'client-1', 0)
    attempts.recordFailure('group-1', 'client-1', policy.failedAttemptProtection)
    const failing = new VaultService({
      repository: {
        load: async () => { throw new Error('state unavailable') },
        commit: async () => ({ ok: false as const, code: 'revision-conflict' as const }),
        appendAudit: async () => undefined,
      },
      policy,
      grants,
      attempts,
    })

    await expect(failing.handle({ action: 'snapshot', clientInstanceId: 'client-1' }))
      .resolves.toEqual({ ok: false, error: { code: 'operation-failed', message: 'Vault operation failed' } })
    expect(grants.authorize(grant.token, 'group-1', 1, 'client-1')).toBe(false)
    expect(attempts.recordFailure('group-1', 'client-1', policy.failedAttemptProtection))
      .toEqual({ kind: 'rejected', remainingAttempts: 1 })
  })

  it('clears cached state, grants, attempts, and touch throttling when refresh load fails', async () => {
    const stateDir = join(root, 'refresh-failure-vault')
    const backing = new VaultStateRepository(stateDir)
    let failLoad = false
    const grants = new InMemoryGrantStore({ monotonicNow: () => 100, wallNow: () => 1_000 })
    const attempts = new FailedAttemptStore({ monotonicNow: () => 100, wallNow: () => 1_000 })
    const failing = new VaultService({
      repository: {
        load: async () => {
          if (failLoad) throw new Error('state unavailable')
          return backing.load()
        },
        commit: (expectedRevision, next) => backing.commit(expectedRevision, next),
        appendAudit: (event) => backing.appendAudit(event),
      },
      policy,
      grants,
      attempts,
      wallNow: () => 1_000,
    })
    const created = await failing.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const unlocked = await failing.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!unlocked.ok) throw new Error('unlock failed')
    expect(failing.touchActivity('client-1', [unlocked.value.grant])).toEqual({ valid: true, touched: true })
    await expect(failing.handle({ action: 'unlock', clientInstanceId: 'client-2', groupId, password: 'wrong horse' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-credentials' } })
    const persisted = await backing.load()

    failLoad = true
    await expect(failing.handle({ action: 'snapshot', clientInstanceId: 'client-1' }))
      .resolves.toEqual({ ok: false, error: { code: 'operation-failed', message: 'Vault operation failed' } })
    expect(grants.authorize(unlocked.value.grant.token, groupId, 1, 'client-1')).toBe(false)

    await fs.writeFile(join(stateDir, 'state.json'), JSON.stringify({
      ...persisted,
      groups: { ...persisted.groups, [groupId]: { ...persisted.groups[groupId]!, name: 'Recovered same revision' } },
    }))
    failLoad = false
    await expect(failing.handle({ action: 'snapshot', clientInstanceId: 'client-1' }))
      .resolves.toMatchObject({ ok: true, value: { revision: 1, groups: [{ name: 'Recovered same revision' }] } })
    const renewed = await failing.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!renewed.ok) throw new Error('unlock failed')
    expect(failing.touchActivity('client-1', [renewed.value.grant])).toEqual({ valid: true, touched: true })
    await expect(failing.handle({ action: 'unlock', clientInstanceId: 'client-2', groupId, password: 'wrong horse' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-credentials' } })
  })

  it('invalidates volatile authorization before a same-revision conflict reload', async () => {
    const backing = new VaultStateRepository(join(root, 'same-revision-conflict-vault'))
    let conflict = false
    const grants = new InMemoryGrantStore({ monotonicNow: () => 100, wallNow: () => 1_000 })
    const attempts = new FailedAttemptStore({ monotonicNow: () => 100, wallNow: () => 1_000 })
    const conflicted = new VaultService({
      repository: {
        load: () => backing.load(),
        commit: (expectedRevision, next) => conflict
          ? Promise.resolve({ ok: false as const, code: 'revision-conflict' as const })
          : backing.commit(expectedRevision, next),
        appendAudit: (event) => backing.appendAudit(event),
      },
      policy,
      grants,
      attempts,
      wallNow: () => 1_000,
    })
    const created = await conflicted.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const unlocked = await conflicted.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!unlocked.ok) throw new Error('unlock failed')
    expect(conflicted.touchActivity('client-1', [unlocked.value.grant])).toEqual({ valid: true, touched: true })
    await conflicted.handle({ action: 'unlock', clientInstanceId: 'client-2', groupId, password: 'wrong horse' })

    conflict = true
    await expect(conflicted.handle(groupCreateRequest(1, { name: 'Conflict', password: 'conflict horse', bindings: [] })))
      .resolves.toEqual({ ok: false, error: { code: 'revision-conflict', message: 'Vault revision changed' } })
    expect(grants.authorize(unlocked.value.grant.token, groupId, 1, 'client-1')).toBe(false)

    conflict = false
    const renewed = await conflicted.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!renewed.ok) throw new Error('unlock failed')
    expect(conflicted.touchActivity('client-1', [renewed.value.grant])).toEqual({ valid: true, touched: true })
    await expect(conflicted.handle({ action: 'unlock', clientInstanceId: 'client-2', groupId, password: 'wrong horse' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-credentials' } })
  })

  it('clears volatile state when the repository conflict reload fails', async () => {
    const stateDir = join(root, 'conflict-reload-failure-vault')
    const backing = new VaultStateRepository(stateDir)
    let conflictNext = false
    let failLoad = false
    const grants = new InMemoryGrantStore({ monotonicNow: () => 100, wallNow: () => 1_000 })
    const attempts = new FailedAttemptStore({ monotonicNow: () => 100, wallNow: () => 1_000 })
    const conflicted = new VaultService({
      repository: {
        load: async () => {
          if (failLoad) throw new Error('conflict reload unavailable')
          return backing.load()
        },
        commit: async (expectedRevision, next) => {
          if (conflictNext) {
            conflictNext = false
            failLoad = true
            return { ok: false as const, code: 'revision-conflict' as const }
          }
          return backing.commit(expectedRevision, next)
        },
        appendAudit: (event) => backing.appendAudit(event),
      },
      policy,
      grants,
      attempts,
      wallNow: () => 1_000,
    })
    const created = await conflicted.handle(groupCreateRequest(0, { name: 'Primary', password: 'correct horse', bindings: [] }))
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const persisted = await backing.load()
    const unlocked = await conflicted.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!unlocked.ok) throw new Error('unlock failed')
    expect(conflicted.touchActivity('client-1', [unlocked.value.grant])).toEqual({ valid: true, touched: true })
    await conflicted.handle({ action: 'unlock', clientInstanceId: 'client-2', groupId, password: 'wrong horse' })

    conflictNext = true
    await expect(conflicted.handle(groupCreateRequest(1, { name: 'Conflict', password: 'conflict horse', bindings: [] })))
      .resolves.toEqual({ ok: false, error: { code: 'persistence-failed', message: 'Vault operation failed' } })
    expect(grants.authorize(unlocked.value.grant.token, groupId, 1, 'client-1')).toBe(false)

    await fs.writeFile(join(stateDir, 'state.json'), JSON.stringify({
      ...persisted,
      groups: { ...persisted.groups, [groupId]: { ...persisted.groups[groupId]!, name: 'Recovered conflict revision' } },
    }))
    failLoad = false
    await expect(conflicted.handle({ action: 'snapshot', clientInstanceId: 'client-1' }))
      .resolves.toMatchObject({ ok: true, value: { revision: 1, groups: [{ name: 'Recovered conflict revision' }] } })
    const renewed = await conflicted.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })
    if (!renewed.ok) throw new Error('unlock failed')
    expect(conflicted.touchActivity('client-1', [renewed.value.grant])).toEqual({ valid: true, touched: true })
    await expect(conflicted.handle({ action: 'unlock', clientInstanceId: 'client-2', groupId, password: 'wrong horse' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-credentials' } })
  })
})
