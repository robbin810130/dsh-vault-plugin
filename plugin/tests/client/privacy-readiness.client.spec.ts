import { describe, expect, it } from 'vitest'
import type { VaultApiClient } from '../../src/client/api.js'
import type { VaultApiResult, VaultSnapshot } from '../../src/shared/contracts.js'
import { createVaultClientStore } from '../../src/client/store.js'
import { createVaultAccessProvider } from '../../src/client/access/provider.js'
import { createVaultRowDecorator, rememberWorkspaceIdForSession } from '../../src/client/rows/presentation.js'

const secret = {
  label: 'SECRET-TITLE', ariaLabel: 'SECRET-ARIA', detail: 'SECRET-DETAIL',
  tooltip: 'SECRET-HOVER', copyText: 'SECRET-COPY', workspaceLabel: 'SECRET-WORKSPACE',
  snippet: 'SECRET-SEARCH-BODY', concealed: false,
}
const hidden = { label: 'session', ariaLabel: 'session', concealed: true }
const snapshot = (visibility: VaultSnapshot['policy']['lockedNameVisibility'] = 'all-hidden'): VaultSnapshot => ({
  revision: 1,
  policy: { autoLockMinutes: 15, lockOnSystemSleep: true, lockedNameVisibility: visibility,
    failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 } },
  groups: [{ id: 'g', name: 'group', credentialVersion: 1, recoveryConfigured: false, recoveryGeneratedAt: 'now', memberCount: 1 }],
  bindings: [
    { targetType: 'workspace', targetId: 'locked', mode: 'direct', passwordGroupId: 'g', createdAt: 'now', updatedAt: 'now' },
    { targetType: 'session', targetId: 'inherit', mode: 'inherit', createdAt: 'now', updatedAt: 'now' },
    { targetType: 'session', targetId: 'except', mode: 'no-inherit', createdAt: 'now', updatedAt: 'now' },
    { targetType: 'session', targetId: 'direct', mode: 'direct', passwordGroupId: 'g', createdAt: 'now', updatedAt: 'now' },
  ],
})
function setup(read: () => Promise<VaultApiResult<VaultSnapshot>>) {
  // Only replace the remote API; store lifecycle, resolution and redaction are real.
  const api: VaultApiClient = { call: async <T>() => await read() as VaultApiResult<T> }
  const store = createVaultClientStore(api)
  return { store, access: createVaultAccessProvider(store), rows: createVaultRowDecorator(store, key => key) }
}

describe('Vault cold-start privacy', () => {
  it.each(['loading', 'offline'] as const)('claims all targets and blocks content while %s', async phase => {
    const { store, access } = setup(async () => ({ ok: false, error: { code: 'operation-failed', message: 'offline' } }))
    if (phase === 'offline') await store.refresh()
    expect(store.getSnapshot().host).toBe(phase)
    expect(access.matchesWorkspace('unknown-workspace')).toBe(true)
    for (const parent of [undefined, null, 'plain']) {
      expect(access.matchesSession('cold-session', parent)).toBe(true)
      expect(access.sessionState('cold-session', parent).kind).toBe('blocked')
    }
    expect(access.workspaceState('unknown-workspace').kind).toBe('blocked')
    access.dispose()
  })

  it('keeps slow first snapshot concealed and releases confirmed plain targets after success', async () => {
    let finish!: (value: VaultApiResult<VaultSnapshot>) => void
    const { store, access, rows } = setup(() => new Promise(resolve => { finish = resolve }))
    const refreshing = store.refresh()
    expect(rows.workspace?.('plain', secret)).toEqual({ label: 'workspace', ariaLabel: 'workspace', concealed: true })
    expect(rows.session?.('slow-session', secret, null)).toEqual(hidden)
    expect(access.sessionState('slow-session', null).kind).toBe('blocked')
    finish({ ok: true, value: { ...snapshot(), groups: [], bindings: [] } })
    await refreshing
    expect(access.matchesSession('slow-session', null)).toBe(false)
    expect(access.sessionState('slow-session', null).kind).toBe('allow')
    expect(rows.workspace?.('plain', secret)).toEqual(secret)
    expect(rows.session?.('slow-session', secret, null)).toEqual(secret)
    access.dispose()
  })

  it.each(['all-visible', 'workspace-visible-session-hidden', 'all-hidden'] as const)(
    'ignores permissive %s names while offline and recovers after refresh', async visibility => {
      let online = true
      const { store, access, rows } = setup(async () => online
        ? { ok: true, value: snapshot(visibility) }
        : { ok: false, error: { code: 'operation-failed', message: 'offline' } })
      await store.refresh()
      online = false
      await store.refresh()
      expect(rows.workspace?.('locked', secret)?.concealed).toBe(true)
      expect(rows.session?.('except', secret, 'locked')).toEqual(hidden)
      expect(rows.session?.('orphan', secret, null)).toEqual(hidden)
      expect(access.matchesSession('except', 'locked')).toBe(true)
      expect(access.sessionState('except', 'locked').kind).toBe('blocked')
      online = true
      await store.refresh()
      expect(rows.session?.('except', secret, 'locked')).toEqual(secret)
      expect(access.sessionState('except', 'locked').kind).toBe('allow')
      access.dispose()
    },
  )
})

describe('Vault inherited search privacy', () => {
  it('uses current content membership without requiring matching or sidebar rendering', async () => {
    const { store, access } = setup(async () => ({ ok: true, value: snapshot() }))
    await store.refresh()
    rememberWorkspaceIdForSession('content-move', 'plain')
    expect(access.sessionState('content-move', undefined).kind).toBe('blocked')
    expect(access.matchesSession('content-move', undefined)).toBe(true)
    expect(access.sessionState('content-move', 'locked').kind).toBe('blocked')
    expect(access.sessionState('content-move').kind).toBe('blocked')
    expect(access.sessionState('content-move', null).kind).toBe('allow')
    access.dispose()
  })

  it('discards a remembered plain parent when the host explicitly reports unknown membership', async () => {
    const { store, access, rows } = setup(async () => ({ ok: true, value: snapshot() }))
    await store.refresh()
    rememberWorkspaceIdForSession('stale-plain', 'plain')
    expect(rows.session?.('stale-plain', secret)).toEqual(secret)
    expect(rows.session?.('stale-plain', secret, undefined)).toEqual(hidden)
    expect(access.sessionState('stale-plain').kind).toBe('blocked')
    access.dispose()
  })

  it.each([
    ['unknown', undefined, true], ['orphan', null, false],
    ['implicit', 'locked', true], ['inherit', 'locked', true],
    ['inherit', undefined, true], ['inherit', null, true],
    ['except', 'locked', false], ['except', undefined, false],
    ['direct', null, true], ['plain', 'plain', false],
  ] as const)('%s with parent %s is concealed=%s', async (id, parent, concealed) => {
    const { store, access, rows } = setup(async () => ({ ok: true, value: snapshot() }))
    await store.refresh()
    expect(rows.session?.(id, secret, parent)).toEqual(concealed ? hidden : secret)
    expect(access.matchesSession(id, parent)).toBe(concealed)
    expect(access.sessionState(id, parent).kind).toBe(concealed ? 'blocked' : 'allow')
    access.dispose()
  })

  it('uses remembered membership only when host context is omitted, not when it confirms an orphan or move', async () => {
    const { store, access, rows } = setup(async () => ({ ok: true, value: snapshot() }))
    await store.refresh()
    rememberWorkspaceIdForSession('remembered-search', 'locked')
    expect(rows.session?.('remembered-search', secret)).toEqual(hidden)
    expect(rows.session?.('remembered-search', secret, null)).toEqual(secret)
    expect(rows.session?.('remembered-search', secret, 'plain')).toEqual(secret)
    expect(rows.session?.('remembered-search', secret, 'locked')).toEqual(hidden)
    await access.requestSession('remembered-search', 'plain')
    await access.requestSession('remembered-search', null)
    expect(access.sessionState('remembered-search', null).kind).toBe('allow')
    // Confirmed absence discards remembered membership; omitted context is unknown again.
    expect(access.sessionState('remembered-search').kind).toBe('blocked')
    access.dispose()
  })
})
