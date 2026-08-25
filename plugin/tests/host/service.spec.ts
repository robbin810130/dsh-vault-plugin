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
})
