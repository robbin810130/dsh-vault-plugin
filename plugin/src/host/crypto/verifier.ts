import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export interface SecretVerifier {
  readonly salt: string
  readonly verifier: string
  readonly kdf: 'scrypt'
  readonly parameters: {
    readonly cost: 32768
    readonly blockSize: 8
    readonly parallelization: 1
    readonly keyLength: 32
  }
}

const PARAMETERS = {
  cost: 32768,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
} as const

const MIN_SECRET_CHARACTERS = 8
const MAX_SECRET_BYTES = 512
const SALT_LENGTH = 16
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const COMPACT_RECOVERY_KEY = /^[A-Z2-7]{52}$/
const GROUPED_RECOVERY_KEY = /^(?:[A-Z2-7]{4}-){12}[A-Z2-7]{4}$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export interface SecretPolicy {
  readonly minLength?: number
}

function prepareSecret(secret: string, policy: SecretPolicy = {}): string {
  if (Buffer.byteLength(secret, 'utf8') > MAX_SECRET_BYTES) {
    throw new RangeError(`Secret must not exceed ${MAX_SECRET_BYTES} UTF-8 bytes`)
  }
  const minLength = policy.minLength ?? MIN_SECRET_CHARACTERS
  if (!Number.isSafeInteger(minLength) || minLength < 1 || Array.from(secret).length < minLength) {
    throw new RangeError(`Secret must contain at least ${minLength} Unicode code points`)
  }

  if (COMPACT_RECOVERY_KEY.test(secret)) return secret
  if (GROUPED_RECOVERY_KEY.test(secret)) return secret.replaceAll('-', '')
  return secret
}

function derive(secret: string, salt: Buffer, policy?: SecretPolicy): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(prepareSecret(secret, policy), salt, PARAMETERS.keyLength, {
      N: PARAMETERS.cost,
      r: PARAMETERS.blockSize,
      p: PARAMETERS.parallelization,
      maxmem: SCRYPT_MAX_MEMORY,
    }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

function decodeBase64(value: string): Buffer | undefined {
  if (value.length === 0 || !BASE64.test(value)) return undefined

  const decoded = Buffer.from(value, 'base64')
  return decoded.toString('base64') === value ? decoded : undefined
}

function hasExpectedParameters(record: SecretVerifier): boolean {
  return record.kdf === 'scrypt'
    && record.parameters?.cost === PARAMETERS.cost
    && record.parameters.blockSize === PARAMETERS.blockSize
    && record.parameters.parallelization === PARAMETERS.parallelization
    && record.parameters.keyLength === PARAMETERS.keyLength
}

export async function createVerifier(secret: string, policy?: SecretPolicy): Promise<SecretVerifier> {
  const salt = randomBytes(SALT_LENGTH)
  const verifier = await derive(secret, salt, policy)

  return {
    salt: salt.toString('base64'),
    verifier: verifier.toString('base64'),
    kdf: 'scrypt',
    parameters: PARAMETERS,
  }
}

export async function verifySecret(secret: string, record: SecretVerifier, policy?: SecretPolicy): Promise<boolean> {
  if (!hasExpectedParameters(record)) return false

  const salt = decodeBase64(record.salt)
  const expected = decodeBase64(record.verifier)
  if (salt?.length !== SALT_LENGTH || expected?.length !== PARAMETERS.keyLength) return false

  let actual: Buffer
  try {
    actual = await derive(secret, salt, policy)
  } catch (error) {
    if (error instanceof RangeError) return false
    throw error
  }

  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

function encodeBase32(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let encoded = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) encoded += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return encoded
}

export function generateRecoveryKey(): string {
  return encodeBase32(randomBytes(32)).match(/.{4}/g)?.join('-') ?? ''
}
