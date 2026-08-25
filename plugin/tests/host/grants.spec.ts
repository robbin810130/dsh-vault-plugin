import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { InMemoryGrantStore } from '../../src/host/auth/grants.js'

function bytes(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill)
}

describe('InMemoryGrantStore', () => {
  it('returns a 256-bit raw token once and indexes Host state by its digest', () => {
    const requestedSizes: number[] = []
    const store = new InMemoryGrantStore({
      randomBytes: (size) => {
        requestedSizes.push(size)
        return bytes(1)
      },
    })

    const grant = store.issue('group-a', 1, 'client-a', 1_000)
    const persisted = (store as unknown as { grants: Map<string, unknown> }).grants
    const digest = createHash('sha256').update(grant.token, 'utf8').digest('hex')

    expect(requestedSizes).toEqual([32])
    expect(grant.token).toBe(Buffer.from(bytes(1)).toString('base64url'))
    expect([...persisted.keys()]).toEqual([digest])
    expect(JSON.stringify([...persisted])).not.toContain(grant.token)
    expect(store.authorize(grant.token, 'group-a', 1, 'client-a')).toBe(true)
  })

  it('binds authorization to group, credential version, and client instance', () => {
    const store = new InMemoryGrantStore({ randomBytes: () => bytes(3) })
    const grant = store.issue('group-a', 7, 'client-a', 1_000)

    expect(store.authorize(grant.token, 'group-b', 7, 'client-a')).toBe(false)
    expect(store.authorize(grant.token, 'group-a', 8, 'client-a')).toBe(false)
    expect(store.authorize(grant.token, 'group-a', 7, 'client-b')).toBe(false)
    expect(store.authorize(grant.token, 'group-a', 7, 'client-a')).toBe(true)
  })

  it('uses the monotonic clock for expiry and the wall clock only for display timestamps', () => {
    let monotonicNow = 100
    let wallNow = 10_000
    const store = new InMemoryGrantStore({
      monotonicNow: () => monotonicNow,
      wallNow: () => wallNow,
      randomBytes: () => bytes(4),
    })

    const grant = store.issue('group-a', 1, 'client-a', 50)
    expect(grant.issuedAt).toBe(10_000)
    expect(grant.expiresAt).toBe(10_050)

    wallNow = 1_000_000
    monotonicNow = 149
    expect(store.authorize(grant.token, 'group-a', 1, 'client-a')).toBe(true)

    wallNow = 0
    monotonicNow = 150
    expect(store.authorize(grant.token, 'group-a', 1, 'client-a')).toBe(false)
  })

  it('revokes only matching groups or clients', () => {
    const tokens = [bytes(5), bytes(6), bytes(7)]
    const store = new InMemoryGrantStore({ randomBytes: () => tokens.shift()! })
    const groupAClientA = store.issue('group-a', 1, 'client-a', 1_000)
    const groupAClientB = store.issue('group-a', 1, 'client-b', 1_000)
    const groupBClientA = store.issue('group-b', 1, 'client-a', 1_000)

    store.revokeGroup('group-a')
    expect(store.authorize(groupAClientA.token, 'group-a', 1, 'client-a')).toBe(false)
    expect(store.authorize(groupAClientB.token, 'group-a', 1, 'client-b')).toBe(false)
    expect(store.authorize(groupBClientA.token, 'group-b', 1, 'client-a')).toBe(true)

    store.revokeClient('client-a')
    expect(store.authorize(groupBClientA.token, 'group-b', 1, 'client-a')).toBe(false)
  })

  it('clears all grants and starts empty after a Host restart', () => {
    const options = { randomBytes: () => bytes(8) }
    const beforeRestart = new InMemoryGrantStore(options)
    const grant = beforeRestart.issue('group-a', 1, 'client-a', 1_000)

    beforeRestart.clear()
    expect(beforeRestart.authorize(grant.token, 'group-a', 1, 'client-a')).toBe(false)

    const afterRestart = new InMemoryGrantStore(options)
    expect(afterRestart.authorize(grant.token, 'group-a', 1, 'client-a')).toBe(false)
  })
})
