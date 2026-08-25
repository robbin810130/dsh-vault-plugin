import { Buffer } from 'node:buffer'
import { vi } from 'vitest'

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    timingSafeEqual: vi.fn(actual.timingSafeEqual),
  }
})

import { timingSafeEqual } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createVerifier, generateRecoveryKey, verifySecret } from '../../src/host/crypto/verifier.js'

const timingSafeEqualMock = vi.mocked(timingSafeEqual)

describe('password and recovery verifier', () => {
  beforeEach(() => {
    timingSafeEqualMock.mockClear()
  })

  it('accepts the exact secret and rejects a wrong secret', async () => {
    const record = await createVerifier('correct horse battery staple')

    await expect(verifySecret('correct horse battery staple', record)).resolves.toBe(true)
    await expect(verifySecret('correct horse battery staples', record)).resolves.toBe(false)
  })

  it('uses a unique salt and the documented scrypt parameters', async () => {
    const first = await createVerifier('same secret')
    const second = await createVerifier('same secret')

    expect(first).toMatchObject({
      kdf: 'scrypt',
      parameters: { cost: 32768, blockSize: 8, parallelization: 1, keyLength: 32 },
    })
    expect(first.salt).not.toBe(second.salt)
    expect(first.verifier).not.toBe(second.verifier)
    expect(Buffer.from(first.salt, 'base64')).toHaveLength(16)
    expect(Buffer.from(first.verifier, 'base64')).toHaveLength(32)
  })

  it('does not trim password input', async () => {
    const record = await createVerifier('  eight chars  ')

    await expect(verifySecret('eight chars', record)).resolves.toBe(false)
    await expect(verifySecret('  eight chars  ', record)).resolves.toBe(true)
  })

  it('accepts 512 UTF-8 bytes and rejects 513 UTF-8 bytes including multibyte input', async () => {
    const exactly512Bytes = `${'界'.repeat(170)}ab`
    const exactly513Bytes = `${'界'.repeat(170)}abc`

    await expect(createVerifier(exactly512Bytes)).resolves.toMatchObject({ kdf: 'scrypt' })
    await expect(createVerifier(exactly513Bytes)).rejects.toThrow(RangeError)
  })

  it('generates 32-byte uppercase base32 recovery keys in four-character groups', () => {
    const key = generateRecoveryKey()

    expect(key).toMatch(/^(?:[A-Z2-7]{4}-){12}[A-Z2-7]{4}$/)
  })

  it('accepts removal of ASCII hyphens from recovery keys but no other format changes', async () => {
    const key = generateRecoveryKey()
    const record = await createVerifier(key)

    await expect(verifySecret(key.replaceAll('-', ''), record)).resolves.toBe(true)
    await expect(verifySecret(key.toLowerCase(), record)).resolves.toBe(false)
    await expect(verifySecret(key.replace('-', ' '), record)).resolves.toBe(false)
  })

  it.each([
    ['salt', 'not base64!'],
    ['verifier', 'not base64!'],
    ['verifier', Buffer.alloc(31).toString('base64')],
  ] as const)('refuses malformed persisted %s values', async (field, value) => {
    const record = await createVerifier('valid secret')

    await expect(verifySecret('valid secret', { ...record, [field]: value })).resolves.toBe(false)
  })

  it('invokes timingSafeEqual for valid persisted verifier bytes', async () => {
    const record = await createVerifier('timing-safe secret')

    await expect(verifySecret('timing-safe secret', record)).resolves.toBe(true)
    expect(timingSafeEqualMock).toHaveBeenCalledOnce()
    expect(timingSafeEqualMock.mock.calls[0]?.[0]).toHaveLength(32)
    expect(timingSafeEqualMock.mock.calls[0]?.[1]).toHaveLength(32)
  })
})
