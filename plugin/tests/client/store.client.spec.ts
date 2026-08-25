import { describe, expect, it, vi } from 'vitest'
import type {
  BindingMutation,
  ChangePasswordInput,
  CreateGroupInput,
  GrantProof,
  RecoverGroupInput,
  VaultApiRequest,
  VaultApiResult,
  VaultSnapshot,
} from '../../src/shared/contracts.js'
import type { VaultApiClient } from '../../src/client/api.js'
import { createVaultClientStore } from '../../src/client/store.js'

const TOKEN_A = 'A'.repeat(43)
const TOKEN_B = 'B'.repeat(43)

function makeSnapshot(revision = 1): VaultSnapshot {
  return {
    revision,
    policy: {
      autoLockMinutes: 15,
      lockOnSystemSleep: true,
      lockedNameVisibility: 'workspace-visible-session-hidden',
      failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 },
    },
    groups: [
      {
        id: 'group-a',
        name: 'Alpha',
        credentialVersion: 1,
        recoveryConfigured: true,
        recoveryGeneratedAt: '2026-08-25T00:00:00.000Z',
        memberCount: 1,
      },
      {
        id: 'group-b',
        name: 'Beta',
        credentialVersion: 2,
        recoveryConfigured: true,
        recoveryGeneratedAt: '2026-08-25T00:00:00.000Z',
        recoveryLastVerifiedAt: '2026-08-25T01:00:00.000Z',
        memberCount: 1,
      },
    ],
    bindings: [{
      targetType: 'workspace',
      targetId: 'workspace-a',
      mode: 'direct',
      passwordGroupId: 'group-a',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    }],
  }
}

function ok<T>(value: T): VaultApiResult<T> {
  return { ok: true, value }
}

function failed(code = 'host-unavailable'): VaultApiResult<never> {
  return { ok: false, error: { code, message: 'Vault host unavailable' } }
}

function grant(groupId: string): GrantProof {
  return {
    groupId,
    credentialVersion: groupId === 'group-a' ? 1 : 2,
    token: groupId === 'group-a' ? TOKEN_A : TOKEN_B,
  }
}

type ApiHandler = (request: VaultApiRequest, signal?: AbortSignal) => Promise<VaultApiResult<unknown>> | VaultApiResult<unknown>

class RecordingApi implements VaultApiClient {
  readonly calls: VaultApiRequest[] = []

  constructor(private readonly handler: ApiHandler) {}

  async call<T>(request: VaultApiRequest, signal?: AbortSignal): Promise<VaultApiResult<T>> {
    this.calls.push(structuredClone(request))
    return await this.handler(request, signal) as VaultApiResult<T>
  }
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

function installBrowserPersistenceTraps(): () => void {
  const names = ['localStorage', 'sessionStorage', 'indexedDB'] as const
  const descriptors = new Map<PropertyKey, PropertyDescriptor | undefined>()
  for (const name of names) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() { throw new Error(`${name} must not be accessed`) },
    })
  }

  descriptors.set('document', Object.getOwnPropertyDescriptor(globalThis, 'document'))
  const documentTrap = {}
  Object.defineProperty(documentTrap, 'cookie', {
    configurable: true,
    get() { throw new Error('cookie must not be read') },
    set() { throw new Error('cookie must not be written') },
  })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentTrap })

  return () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name)
      else Object.defineProperty(globalThis, name, descriptor)
    }
  }
}

describe('Vault client store', () => {
  it('creates exactly one UUID per store instance and never accesses browser persistence', async () => {
    const restore = installBrowserPersistenceTraps()
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
    const api = new RecordingApi((request) => request.action === 'snapshot' ? ok(makeSnapshot()) : ok(null))

    try {
      const first = createVaultClientStore(api)
      const second = createVaultClientStore(api)
      const firstId = first.clientInstanceId

      expect(firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      expect(second.clientInstanceId).not.toBe(firstId)
      expect(randomUUID).toHaveBeenCalledTimes(2)
      expect(() => {
        ;(first as unknown as { clientInstanceId: string }).clientInstanceId = second.clientInstanceId
      }).toThrow()
      await first.refresh()
      await first.lockAll()
      expect(first.clientInstanceId).toBe(firstId)
      expect(api.calls.map(call => call.clientInstanceId)).toEqual([firstId, firstId])
    } finally {
      restore()
    }
  })

  it('publishes deeply immutable snapshots detached from Host objects and grant tokens', async () => {
    const source = makeSnapshot()
    const api = new RecordingApi((request) => {
      if (request.action === 'snapshot') return ok(source)
      if (request.action === 'unlock') return ok({ grant: grant(request.groupId), expiresAt: 10_000 })
      throw new Error('unexpected action')
    })
    const store = createVaultClientStore(api)

    await store.refresh()
    await store.unlock('group-a', 'correct horse')
    const exposed = store.getSnapshot()

    expect(Object.isFrozen(exposed)).toBe(true)
    expect(Object.isFrozen(exposed.groups)).toBe(true)
    expect(Object.isFrozen(exposed.groups[0])).toBe(true)
    expect(Object.isFrozen(exposed.bindings)).toBe(true)
    expect(Object.isFrozen(exposed.bindings[0])).toBe(true)
    expect(Object.isFrozen(exposed.unlockedGroupIds)).toBe(true)
    expect(() => (exposed.groups as unknown as unknown[]).push({})).toThrow()
    expect(() => { (exposed.groups[0] as { name: string }).name = 'mutated' }).toThrow()
    expect(() => (exposed.unlockedGroupIds as unknown as Set<string>).add('group-b')).toThrow()

    ;(source.groups[0] as { name: string }).name = 'server-mutated'
    ;(source.bindings as unknown as unknown[]).push({ targetId: 'injected' })
    expect(store.getSnapshot().groups[0]!.name).toBe('Alpha')
    expect(store.getSnapshot().bindings).toHaveLength(1)
    expect([...store.getSnapshot().unlockedGroupIds]).toEqual(['group-a'])
    expect(JSON.stringify(store.getSnapshot())).not.toContain(TOKEN_A)
    expect(JSON.stringify(store.getSnapshot())).not.toContain('correct horse')
  })

  it('refreshes redacted state first, validates only this tab proofs, and removes only invalid grants', async () => {
    const api = new RecordingApi((request) => {
      if (request.action === 'snapshot') return ok(makeSnapshot(2))
      if (request.action === 'unlock') return ok({ grant: grant(request.groupId), expiresAt: 10_000 })
      if (request.action === 'grants-validate') {
        return ok({ valid: request.grants[0]?.groupId === 'group-a' })
      }
      throw new Error('unexpected action')
    })
    const store = createVaultClientStore(api)

    await store.refresh()
    await store.unlock('group-a', 'alpha password')
    await store.unlock('group-b', 'beta password')
    api.calls.length = 0

    await store.refresh()

    expect(api.calls.map(call => call.action)).toEqual(['snapshot', 'grants-validate', 'grants-validate'])
    expect(api.calls.slice(1).map(call => call.action === 'grants-validate' ? call.grants : [])).toEqual([
      [grant('group-a')],
      [grant('group-b')],
    ])
    expect([...store.getSnapshot().unlockedGroupIds]).toEqual(['group-a'])

    api.calls.length = 0
    await store.refresh()
    expect(api.calls.map(call => call.action)).toEqual(['snapshot', 'grants-validate'])
    expect(api.calls[1]).toMatchObject({ action: 'grants-validate', grants: [grant('group-a')] })
  })

  it.each([
    ['successful snapshot', ok(makeSnapshot(1))],
    ['failed snapshot', failed()],
  ])('ignores a stale refresh %s after a newer refresh commits', async (_name, staleResult) => {
    const staleSnapshot = deferred<VaultApiResult<unknown>>()
    let snapshotCalls = 0
    const api = new RecordingApi((request) => {
      if (request.action !== 'snapshot') throw new Error('unexpected action')
      snapshotCalls += 1
      return snapshotCalls === 1 ? staleSnapshot.promise : ok(makeSnapshot(2))
    })
    const store = createVaultClientStore(api)

    const staleRefresh = store.refresh()
    await vi.waitFor(() => expect(api.calls).toHaveLength(1))
    const latestRefresh = store.refresh()
    await latestRefresh
    staleSnapshot.resolve(staleResult)
    await staleRefresh

    expect(store.getSnapshot()).toMatchObject({ host: 'ready', revision: 2 })
  })

  it.each([
    ['invalid validation result', ok({ valid: false })],
    ['failed validation', failed()],
  ])('ignores a stale refresh %s without clearing its proof or current snapshot', async (_name, staleResult) => {
    const staleValidation = deferred<VaultApiResult<unknown>>()
    let snapshotCalls = 0
    let validationCalls = 0
    const api = new RecordingApi((request) => {
      if (request.action === 'snapshot') return ok(makeSnapshot(++snapshotCalls))
      if (request.action === 'unlock') return ok({ grant: grant(request.groupId), expiresAt: 10_000 })
      if (request.action === 'grants-validate') {
        validationCalls += 1
        return validationCalls === 1 ? staleValidation.promise : ok({ valid: true })
      }
      throw new Error('unexpected action')
    })
    const store = createVaultClientStore(api)
    await store.refresh()
    await store.unlock('group-a', 'alpha password')

    const staleRefresh = store.refresh()
    await vi.waitFor(() => expect(validationCalls).toBe(1))
    const latestRefresh = store.refresh()
    await latestRefresh
    staleValidation.resolve(staleResult)
    await staleRefresh

    expect(store.getSnapshot()).toMatchObject({ host: 'ready', revision: 3 })
    expect([...store.getSnapshot().unlockedGroupIds]).toEqual(['group-a'])

    api.calls.length = 0
    await store.refresh()
    expect(api.calls.map(call => call.action)).toEqual(['snapshot', 'grants-validate'])
  })

  it('fails closed while offline, hides unlocked state, and can retry retained proofs after reconnect', async () => {
    let online = true
    const api = new RecordingApi((request) => {
      if (!online) return failed()
      if (request.action === 'snapshot') return ok(makeSnapshot(4))
      if (request.action === 'unlock') return ok({ grant: grant(request.groupId), expiresAt: 10_000 })
      if (request.action === 'grants-validate') return ok({ valid: true })
      throw new Error('unexpected action')
    })
    const store = createVaultClientStore(api)
    let notifications = 0
    const unsubscribe = store.subscribe(() => { notifications += 1 })

    await store.refresh()
    await store.unlock('group-a', 'alpha password')
    online = false
    const offline = await store.refresh()

    expect(offline).toMatchObject({ ok: false, error: { code: 'host-unavailable' } })
    expect(store.getSnapshot().host).toBe('offline')
    expect([...store.getSnapshot().unlockedGroupIds]).toEqual([])

    online = true
    const recovered = await store.refresh()
    expect(recovered).toMatchObject({ ok: true })
    expect(store.getSnapshot().host).toBe('ready')
    expect([...store.getSnapshot().unlockedGroupIds]).toEqual(['group-a'])
    expect(api.calls.at(-1)).toMatchObject({ action: 'grants-validate', grants: [grant('group-a')] })

    const beforeUnsubscribe = notifications
    unsubscribe()
    await store.lockAll()
    expect(notifications).toBe(beforeUnsubscribe)
  })

  it('adds client id, current revision, and current proofs to mutation requests without snapshotting secrets', async () => {
    let current = makeSnapshot(7)
    const api = new RecordingApi((request) => {
      if (request.action === 'snapshot') return ok(current)
      if (request.action === 'unlock') return ok({ grant: grant(request.groupId), expiresAt: 10_000 })
      if (request.action === 'group-create') {
        current = makeSnapshot(8)
        return ok({ snapshot: current, recoveryKey: 'CREATE-RECOVERY-KEY' })
      }
      if (request.action === 'bindings-update') {
        current = makeSnapshot(9)
        return ok(current)
      }
      if (request.action === 'group-change-password') {
        current = {
          ...makeSnapshot(10),
          groups: makeSnapshot(10).groups.map(group => group.id === 'group-a' ? { ...group, credentialVersion: 2 } : group),
        }
        return ok({ snapshot: current, recoveryKey: 'ROTATED-RECOVERY-KEY' })
      }
      if (request.action === 'group-recover') {
        current = {
          ...makeSnapshot(11),
          groups: makeSnapshot(11).groups.map(group => group.id === 'group-b' ? { ...group, credentialVersion: 3 } : group),
        }
        return ok({ snapshot: current, recoveryKey: 'NEW-RECOVERY-KEY' })
      }
      throw new Error('unexpected action')
    })
    const store = createVaultClientStore(api)
    await store.refresh()
    await store.unlock('group-a', 'alpha password')
    await store.unlock('group-b', 'beta password')

    const createInput: CreateGroupInput = {
      name: 'Gamma',
      password: 'gamma password',
      bindings: [],
    }
    const created = await store.createGroup(createInput)
    const createRequest = api.calls.find(call => call.action === 'group-create')
    expect(createRequest).toEqual({
      action: 'group-create',
      clientInstanceId: store.clientInstanceId,
      expectedRevision: 7,
      grants: [grant('group-a'), grant('group-b')],
      input: createInput,
    })
    expect(created).toMatchObject({ ok: true, value: { recoveryKey: 'CREATE-RECOVERY-KEY' } })

    await store.unlock('group-a', 'alpha password')
    await store.unlock('group-b', 'beta password')
    const mutation: BindingMutation = { kind: 'remove', targetType: 'workspace', targetId: 'workspace-a' }
    await store.updateBindings(mutation)
    const bindingsRequest = api.calls.find(call => call.action === 'bindings-update')
    expect(bindingsRequest).toEqual({
      action: 'bindings-update',
      clientInstanceId: store.clientInstanceId,
      expectedRevision: 8,
      grants: [grant('group-a'), grant('group-b')],
      input: mutation,
    })

    const changeInput: ChangePasswordInput = {
      groupId: 'group-a',
      currentPassword: 'alpha password',
      newPassword: 'new alpha password',
      rotateRecovery: true,
    }
    const changed = await store.changePassword(changeInput)
    expect(api.calls.find(call => call.action === 'group-change-password')).toEqual({
      action: 'group-change-password',
      clientInstanceId: store.clientInstanceId,
      expectedRevision: 9,
      input: changeInput,
    })
    expect(changed).toMatchObject({ ok: true, value: { recoveryKey: 'ROTATED-RECOVERY-KEY' } })

    const recoverInput: RecoverGroupInput = {
      groupId: 'group-b',
      recoveryKey: 'OLD-RECOVERY-KEY',
      newPassword: 'new beta password',
    }
    const recovered = await store.recoverGroup(recoverInput)
    expect(api.calls.find(call => call.action === 'group-recover')).toEqual({
      action: 'group-recover',
      clientInstanceId: store.clientInstanceId,
      expectedRevision: 10,
      input: recoverInput,
    })
    expect(recovered).toMatchObject({ ok: true, value: { recoveryKey: 'NEW-RECOVERY-KEY' } })

    const serialized = JSON.stringify(store.getSnapshot())
    for (const secret of [
      TOKEN_A, TOKEN_B,
      createInput.password, changeInput.currentPassword, changeInput.newPassword,
      recoverInput.recoveryKey, recoverInput.newPassword,
      'CREATE-RECOVERY-KEY', 'ROTATED-RECOVERY-KEY', 'NEW-RECOVERY-KEY',
    ]) expect(serialized).not.toContain(secret)
  })

  it('locks locally on invalid activity, group lock, and lock-all without retaining stale proofs', async () => {
    const api = new RecordingApi((request) => {
      if (request.action === 'snapshot') return ok(makeSnapshot())
      if (request.action === 'unlock') return ok({ grant: grant(request.groupId), expiresAt: 10_000 })
      if (request.action === 'activity-touch') return ok({ valid: false, touched: false })
      if (request.action === 'lock-group' || request.action === 'lock-all') return ok(null)
      if (request.action === 'grants-validate') return ok({ valid: true })
      throw new Error('unexpected action')
    })
    const store = createVaultClientStore(api)
    await store.refresh()
    await store.unlock('group-a', 'alpha password')
    await store.unlock('group-b', 'beta password')

    await store.touchActivity()
    expect([...store.getSnapshot().unlockedGroupIds]).toEqual([])

    await store.unlock('group-a', 'alpha password')
    await store.unlock('group-b', 'beta password')
    await store.lockGroup('group-a')
    expect([...store.getSnapshot().unlockedGroupIds]).toEqual(['group-b'])
    await store.lockAll()
    expect([...store.getSnapshot().unlockedGroupIds]).toEqual([])

    api.calls.length = 0
    await store.refresh()
    expect(api.calls.map(call => call.action)).toEqual(['snapshot'])
  })

  it('sanitizes thrown errors, logs nothing, and leaves no password or recovery value in observable state', async () => {
    const secret = 'never-retain-this-password'
    let throwOnUnlock = false
    const api: VaultApiClient = {
      async call<T>(request: VaultApiRequest): Promise<VaultApiResult<T>> {
        if (request.action === 'snapshot') return ok(makeSnapshot()) as VaultApiResult<T>
        if (request.action === 'unlock' && throwOnUnlock) throw new Error(`transport echoed ${request.password}`)
        throw new Error('unexpected action')
      },
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const store = createVaultClientStore(api)
    await store.refresh()
    throwOnUnlock = true

    const result = await store.unlock('group-a', secret)

    expect(result).toEqual({
      ok: false,
      error: { code: 'host-unavailable', message: 'Vault host unavailable' },
    })
    expect(store.getSnapshot().host).toBe('offline')
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(store.getSnapshot())).not.toContain(secret)
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
