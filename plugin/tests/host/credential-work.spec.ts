import { expect, it } from 'vitest'
import { CredentialWorkQueue } from '../../src/host/auth/credential-work.js'

function barrier() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

it('bounds global work and admission across arbitrary group and client identifiers', async () => {
  const queue = new CredentialWorkQueue()
  const gate = barrier()
  let started = 0
  let active = 0
  let peak = 0
  const batch = Array.from({ length: 80 }, (_, index) => queue.run(`group-${index}`, `client-${index}`, async () => {
    started++
    peak = Math.max(peak, ++active)
    await gate.promise
    active--
    return 'done'
  }, 'busy'))
  expect(started).toBe(4)
  expect(await batch[79]).toBe('busy')
  gate.release()
  const results = await Promise.all(batch)
  expect(peak).toBe(4)
  expect(results.filter(value => value === 'done')).toHaveLength(64)
  expect(results.filter(value => value === 'busy')).toHaveLength(16)
})

it('releases a group slot on exceptions so waiting work can finish', async () => {
  const queue = new CredentialWorkQueue()
  const gate = barrier()
  const first = queue.run('g', 'one', async () => { await gate.promise; throw new Error('failure') }, 'busy')
  const rejected = expect(first).rejects.toThrow('failure')
  const next = queue.run('g', 'two', async () => 'done', 'busy')
  gate.release()
  await rejected
  expect(await next).toBe('done')
})

it('keeps admission occupied until revoked running work actually finishes', async () => {
  const queue = new CredentialWorkQueue()
  const gate = barrier()
  const first = queue.run('g', 'one', async () => { await gate.promise; return 'done' }, 'busy')
  const queued = Array.from({ length: 7 }, () => queue.run('g', 'one', async work => work.revoked ? 'revoked' : 'done', 'busy'))
  queue.revokeClient('one')
  expect(await queue.run('g', 'two', async () => 'done', 'busy')).toBe('busy')
  gate.release()
  await first
  expect(await Promise.all(queued)).toEqual(Array(7).fill('revoked'))
  expect(await queue.run('g', 'two', async () => 'done', 'busy')).toBe('done')
})
