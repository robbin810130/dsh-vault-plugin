import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VaultPolicy } from '../../src/config.js'
import type { GrantProof } from '../../src/shared/contracts.js'
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
    const created = await service.handle({
      action: 'group-create',
      expectedRevision: 0,
      input: { name: 'Primary', password: 'correct horse', bindings: [] },
    })

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

    const result = await failing.handle({
      action: 'group-create', expectedRevision: 0,
      input: { name: 'Primary', password: 'correct horse', bindings: [] },
    })

    expect(result).toEqual({ ok: false, error: { code: 'persistence-failed', message: 'Vault operation failed' } })
  })

  it('enforces failed-attempt cooldown and clears it after a successful unlock', async () => {
    await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
    const snapshot = await service.snapshot()
    const groupId = snapshot.groups[0]!.id

    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'wrong horse' })).resolves.toMatchObject({ ok: false, error: { code: 'invalid-credentials' } })
    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'wrong horse' })).resolves.toMatchObject({ ok: false, error: { code: 'cooldown' } })
  })

  it('touches each client at most once per 60 seconds and supports lock lifecycle', async () => {
    await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
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
    await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
    const groupId = (await service.snapshot()).groups[0]!.id
    await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'wrong horse' })
    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'wrong horse' })).resolves.toMatchObject({ ok: false, error: { code: 'cooldown' } })

    expect(service.lockGroup('client-1', groupId)).toEqual({ ok: true, value: null })
    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })).resolves.toMatchObject({ ok: false, error: { code: 'cooldown' } })
    expect(service.lockAll('client-1')).toEqual({ ok: true, value: null })
    await expect(service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'correct horse' })).resolves.toMatchObject({ ok: false, error: { code: 'cooldown' } })
  })

  it('revokes old and new grants when bindings change or members migrate', async () => {
    const first = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'First', password: 'correct horse', bindings: [] } })
    if (!first.ok) throw new Error('first create failed')
    const firstId = first.value.snapshot.groups[0]!.id
    const second = await service.handle({ action: 'group-create', expectedRevision: 1, input: { name: 'Second', password: 'second horse', bindings: [] } })
    if (!second.ok) throw new Error('second create failed')
    const secondId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Second')!.id
    const firstBinding = { targetType: 'workspace' as const, targetId: 'workspace-1', mode: 'direct' as const, passwordGroupId: firstId, createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z' }
    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: firstBinding } })
    const firstGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: firstId, password: 'correct horse' })
    const secondGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: secondId, password: 'second horse' })
    if (!firstGrant.ok || !secondGrant.ok) throw new Error('unlock failed')
    const secondBinding = { ...firstBinding, passwordGroupId: secondId }
    const replaced = await service.handle({ action: 'bindings-update', expectedRevision: 3, input: { kind: 'replace', binding: secondBinding } })
    expect(replaced).toMatchObject({ ok: true })
    expect(service.validateGrants('client-1', [firstGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [secondGrant.value.grant])).toEqual({ valid: false })

    const thirdGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: secondId, password: 'second horse' })
    if (!thirdGrant.ok) throw new Error('unlock failed')
    await service.handle({ action: 'bindings-update', expectedRevision: 4, input: { kind: 'remove', targetType: 'workspace', targetId: 'workspace-1' } })
    expect(service.validateGrants('client-1', [thirdGrant.value.grant])).toEqual({ valid: false })

    const migrationFirst = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: firstId, password: 'correct horse' })
    const migrationSecond = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: secondId, password: 'second horse' })
    if (!migrationFirst.ok || !migrationSecond.ok) throw new Error('unlock failed')
    const deleted = await service.handle({ action: 'bindings-update', expectedRevision: 5, input: { kind: 'delete-group', groupId: firstId, moveToGroupId: secondId } })
    expect(deleted).toMatchObject({ ok: true })
    expect(service.validateGrants('client-1', [migrationFirst.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [migrationSecond.value.grant])).toEqual({ valid: false })
  })

  it('revokes an inherited workspace grant when a session opts out of inheritance', async () => {
    const created = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Workspace', password: 'workspace horse', bindings: [] } })
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const workspaceBinding = { targetType: 'workspace' as const, targetId: 'workspace-1', mode: 'direct' as const, passwordGroupId: groupId, createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z' }

    await service.handle({ action: 'bindings-update', expectedRevision: 1, input: { kind: 'replace', binding: workspaceBinding } })
    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit', createdAt: workspaceBinding.createdAt, updatedAt: workspaceBinding.updatedAt } } })
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    const optedOut = await service.handle({
      action: 'bindings-update',
      expectedRevision: 3,
      input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'no-inherit', createdAt: workspaceBinding.createdAt, updatedAt: workspaceBinding.updatedAt } },
    })

    expect(optedOut).toMatchObject({ ok: true })
    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('revokes an inherited workspace grant when the session binding is removed', async () => {
    const created = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Workspace', password: 'workspace horse', bindings: [] } })
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    await service.handle({ action: 'bindings-update', expectedRevision: 1, input: { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: groupId, createdAt: timestamp, updatedAt: timestamp } } })
    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit', createdAt: timestamp, updatedAt: timestamp } } })
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    await service.handle({ action: 'bindings-update', expectedRevision: 3, input: { kind: 'remove', targetType: 'session', targetId: 'session-1' } })

    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('revokes both direct and inherited grants when a session protection source changes', async () => {
    const first = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Direct', password: 'direct horse', bindings: [] } })
    const second = await service.handle({ action: 'group-create', expectedRevision: 1, input: { name: 'Workspace', password: 'workspace horse', bindings: [] } })
    if (!first.ok || !second.ok) throw new Error('create failed')
    const directId = first.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Direct')!.id
    const workspaceId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Workspace')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: workspaceId, createdAt: timestamp, updatedAt: timestamp } } })
    await service.handle({ action: 'bindings-update', expectedRevision: 3, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'direct', passwordGroupId: directId, createdAt: timestamp, updatedAt: timestamp } } })
    const directGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directId, password: 'direct horse' })
    const inheritedGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: workspaceId, password: 'workspace horse' })
    if (!directGrant.ok || !inheritedGrant.ok) throw new Error('unlock failed')

    await service.handle({ action: 'bindings-update', expectedRevision: 4, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit', createdAt: timestamp, updatedAt: timestamp } } })

    expect(service.validateGrants('client-1', [directGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [inheritedGrant.value.grant])).toEqual({ valid: false })
  })

  it('revokes grants for both sides of a workspace binding replacement', async () => {
    const first = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Old', password: 'old horse', bindings: [] } })
    const second = await service.handle({ action: 'group-create', expectedRevision: 1, input: { name: 'New', password: 'new horse', bindings: [] } })
    if (!first.ok || !second.ok) throw new Error('create failed')
    const oldId = first.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Old')!.id
    const newId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'New')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: oldId, createdAt: timestamp, updatedAt: timestamp } } })
    await service.handle({ action: 'bindings-update', expectedRevision: 3, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'inherit', createdAt: timestamp, updatedAt: timestamp } } })
    const oldGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: oldId, password: 'old horse' })
    const newGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: newId, password: 'new horse' })
    if (!oldGrant.ok || !newGrant.ok) throw new Error('unlock failed')

    await service.handle({ action: 'bindings-update', expectedRevision: 4, input: { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: newId, createdAt: timestamp, updatedAt: timestamp } } })

    expect(service.validateGrants('client-1', [oldGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [newGrant.value.grant])).toEqual({ valid: false })
  })

  it('revokes implicit workspace grants when adding a session no-inherit binding', async () => {
    const created = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Workspace', password: 'workspace horse', bindings: [] } })
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    await service.handle({ action: 'bindings-update', expectedRevision: 1, input: { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: groupId, createdAt: timestamp, updatedAt: timestamp } } })
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'no-inherit', createdAt: timestamp, updatedAt: timestamp } } })

    expect(service.validateGrants('client-1', [unlocked.value.grant])).toEqual({ valid: false })
  })

  it('revokes implicit old and direct new grants when adding a direct session binding', async () => {
    const first = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Implicit', password: 'implicit horse', bindings: [] } })
    const second = await service.handle({ action: 'group-create', expectedRevision: 1, input: { name: 'Direct', password: 'direct horse', bindings: [] } })
    if (!first.ok || !second.ok) throw new Error('create failed')
    const implicitId = first.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Implicit')!.id
    const directId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Direct')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: implicitId, createdAt: timestamp, updatedAt: timestamp } } })
    const implicitGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: implicitId, password: 'implicit horse' })
    const directGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directId, password: 'direct horse' })
    if (!implicitGrant.ok || !directGrant.ok) throw new Error('unlock failed')

    await service.handle({ action: 'bindings-update', expectedRevision: 3, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'direct', passwordGroupId: directId, createdAt: timestamp, updatedAt: timestamp } } })

    expect(service.validateGrants('client-1', [implicitGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [directGrant.value.grant])).toEqual({ valid: false })
  })

  it('revokes direct old and implicit new grants when removing a direct session binding', async () => {
    const first = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Implicit', password: 'implicit horse', bindings: [] } })
    const second = await service.handle({ action: 'group-create', expectedRevision: 1, input: { name: 'Direct', password: 'direct horse', bindings: [] } })
    if (!first.ok || !second.ok) throw new Error('create failed')
    const implicitId = first.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Implicit')!.id
    const directId = second.value.snapshot.groups.find((group: { readonly name: string }) => group.name === 'Direct')!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: implicitId, createdAt: timestamp, updatedAt: timestamp } } })
    await service.handle({ action: 'bindings-update', expectedRevision: 3, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'direct', passwordGroupId: directId, createdAt: timestamp, updatedAt: timestamp } } })
    const implicitGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: implicitId, password: 'implicit horse' })
    const directGrant = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId: directId, password: 'direct horse' })
    if (!implicitGrant.ok || !directGrant.ok) throw new Error('unlock failed')

    await service.handle({ action: 'bindings-update', expectedRevision: 4, input: { kind: 'remove', targetType: 'session', targetId: 'session-1' } })

    expect(service.validateGrants('client-1', [implicitGrant.value.grant])).toEqual({ valid: false })
    expect(service.validateGrants('client-1', [directGrant.value.grant])).toEqual({ valid: false })
  })

  it('revokes the implicit workspace grant restored by removing no-inherit', async () => {
    const created = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Workspace', password: 'workspace horse', bindings: [] } })
    if (!created.ok) throw new Error('create failed')
    const groupId = created.value.snapshot.groups[0]!.id
    const timestamp = '2026-08-25T00:00:00.000Z'

    await service.handle({ action: 'bindings-update', expectedRevision: 1, input: { kind: 'replace', binding: { targetType: 'workspace', targetId: 'workspace-1', mode: 'direct', passwordGroupId: groupId, createdAt: timestamp, updatedAt: timestamp } } })
    await service.handle({ action: 'bindings-update', expectedRevision: 2, input: { kind: 'replace', binding: { targetType: 'session', targetId: 'session-1', workspaceId: 'workspace-1', mode: 'no-inherit', createdAt: timestamp, updatedAt: timestamp } } })
    const unlocked = await service.handle({ action: 'unlock', clientInstanceId: 'client-1', groupId, password: 'workspace horse' })
    if (!unlocked.ok) throw new Error('unlock failed')

    await service.handle({ action: 'bindings-update', expectedRevision: 3, input: { kind: 'remove', targetType: 'session', targetId: 'session-1' } })

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
    const created = await audited.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
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
    const result = await service.handle({ action: 'group-create', expectedRevision: 9, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
    expect(result).toEqual({ ok: false, error: { code: 'revision-conflict', message: 'Vault revision changed' } })
    expect((await service.snapshot()).revision).toBe(0)
  })

  it('preserves existing bindings when creating another group', async () => {
    const first = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'First', password: 'correct horse', bindings: [] } })
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
    const updated = await service.handle({ action: 'bindings-update', expectedRevision: 1, input: { kind: 'replace', binding } })
    expect(updated.ok).toBe(true)
    const second = await service.handle({ action: 'group-create', expectedRevision: 2, input: { name: 'Second', password: 'correct horse', bindings: [] } })
    expect(second.ok).toBe(true)
    expect((await service.snapshot()).bindings).toEqual([binding])
  })

  it('assigns new direct bindings to the newly created group', async () => {
    const result = await service.handle({
      action: 'group-create', expectedRevision: 0,
      input: { name: 'Primary', password: 'correct horse', bindings: [{
        targetType: 'workspace', targetId: 'workspace-1', mode: 'direct',
        createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
      }] },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.snapshot.bindings[0]?.passwordGroupId).toBe(result.value.snapshot.groups[0]?.id)
  })

  it('rejects duplicate group names without creating another group', async () => {
    await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
    const result = await service.handle({ action: 'group-create', expectedRevision: 1, input: { name: 'Primary', password: 'another horse', bindings: [] } })

    expect(result).toEqual({ ok: false, error: { code: 'duplicate-name', message: 'Vault operation failed' } })
    expect((await service.snapshot()).groups).toHaveLength(1)
  })

  it('returns snapshots that cannot mutate the service state', async () => {
    await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
    const snapshot = await service.snapshot()
    expect(() => (snapshot.bindings as Array<unknown>).push({ targetType: 'workspace' })).toThrow()
    expect(() => { (snapshot.groups as unknown as Array<{ name: string }>)[0]!.name = 'leaked' }).toThrow()

    const fresh = await service.snapshot()
    expect(fresh.bindings).toEqual([])
    expect(fresh.groups[0]?.name).toBe('Primary')
  })

  it('checks revision before credential details and throttles password changes per client', async () => {
    const created = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
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
    const created = await service.handle({ action: 'group-create', expectedRevision: 0, input: { name: 'Primary', password: 'correct horse', bindings: [] } })
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
})
