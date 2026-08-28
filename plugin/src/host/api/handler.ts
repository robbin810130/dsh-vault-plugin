import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { isIPv4, isIPv6 } from 'node:net'
import { MAX_BODY_BYTES, parseVaultApiRequest } from './request.js'
import type { VaultService } from '../service.js'

type HandlerService = Pick<VaultService, 'handle'>

const CREATE_INTENT_TTL_MS = 15_000

class CreateIntentStore {
  readonly entries = new Map<string, { readonly token: string; readonly expiresAt: number }>()

  issue(clientInstanceId: string, now = Date.now()): string {
    const token = randomBytes(32).toString('base64url')
    this.entries.set(clientInstanceId, { token, expiresAt: now + CREATE_INTENT_TTL_MS })
    return token
  }

  consume(clientInstanceId: string, token: string | undefined, now = Date.now()): boolean {
    const entry = this.entries.get(clientInstanceId)
    this.entries.delete(clientInstanceId)
    return entry !== undefined && entry.expiresAt >= now && token !== undefined && entry.token === token
  }
}

class BodyTooLargeError extends Error {}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  if (Array.isArray(value)) return undefined
  return value
}

function loopbackAddress(address: string | undefined): boolean {
  if (!address) return false
  const normalized = address.toLowerCase()
  if (isIPv4(normalized)) return normalized.split('.')[0] === '127'
  if (normalized === '::1') return true
  if (!isIPv6(normalized) || !normalized.startsWith('::ffff:')) return false
  const suffix = normalized.slice('::ffff:'.length)
  if (isIPv4(suffix)) return suffix.split('.')[0] === '127'
  const parts = suffix.split(':')
  if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return false
  const first = Number.parseInt(parts[0]!, 16)
  const second = Number.parseInt(parts[1]!, 16)
  return Number.isInteger(first) && Number.isInteger(second) && (first >>> 8) === 0x7f
}

function localHttpHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (normalized === 'localhost' || normalized === '::1') return true
  return isIPv4(normalized) && normalized.split('.')[0] === '127'
}

function protocol(req: IncomingMessage): 'http' | 'https' {
  return (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function checkOrigin(req: IncomingMessage): boolean {
  const host = header(req, 'host')
  if (!host) return false
  const scheme = protocol(req)
  const origin = header(req, 'origin')
  if (origin === undefined) return false
  if (host.includes(',') || origin.includes(',')) return false
  if (scheme === 'http' && !loopbackAddress(req.socket.remoteAddress)) return false
  try {
    const expectedUrl = new URL(scheme + '://' + host)
    if (expectedUrl.username || expectedUrl.password || expectedUrl.pathname !== '/' || expectedUrl.search || expectedUrl.hash) return false
    if (scheme === 'http' && !localHttpHostname(expectedUrl.hostname)) return false
    const originUrl = new URL(origin)
    if (originUrl.username || originUrl.password || originUrl.pathname !== '/' || originUrl.search || originUrl.hash) return false
    return originUrl.origin === expectedUrl.origin
  } catch {
    return false
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += data.byteLength
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError()
    chunks.push(data)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function createVaultApiHandler(service: HandlerService) {
  const createIntents = new CreateIntentStore()
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Request refused' } })
    if (!checkOrigin(req)) return send(res, 403, { ok: false, error: { code: 'origin-refused', message: 'Request refused' } })
    const contentType = header(req, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return send(res, 415, { ok: false, error: { code: 'unsupported-media-type', message: 'Request refused' } })
    try {
      const body = JSON.parse(await readBody(req)) as unknown
      const source = body !== null && typeof body === 'object' && !Array.isArray(body)
        ? body as Record<string, unknown>
        : undefined
      if (source !== undefined && Object.keys(source).length === 2 && source.action === 'group-create-intent'
        && typeof source.clientInstanceId === 'string' && source.clientInstanceId.length > 0 && source.clientInstanceId.length <= 128) {
        return send(res, 200, { ok: true, value: { intent: createIntents.issue(source.clientInstanceId) } })
      }
      const parsed = parseVaultApiRequest(body)
      if (parsed.action === 'group-create' && !createIntents.consume(parsed.clientInstanceId, parsed.intent)) {
        return send(res, 400, { ok: false, error: { code: 'create-intent-refused', message: 'Request refused' } })
      }
      const result = await service.handle(parsed)
      send(res, 200, result)
    } catch (error) {
      if (error instanceof BodyTooLargeError) return send(res, 413, { ok: false, error: { code: 'body-too-large', message: 'Request refused' } })
      return send(res, 400, { ok: false, error: { code: 'invalid-request', message: 'Request refused' } })
    }
  }
}
