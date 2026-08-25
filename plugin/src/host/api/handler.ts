import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_BODY_BYTES, parseVaultApiRequest } from './request.js'
import type { VaultService } from '../service.js'

type HandlerService = Pick<VaultService, 'handle'>

class BodyTooLargeError extends Error {}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] ?? undefined : value
}

function localHost(host: string): boolean {
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')).toLowerCase() : (host.split(':')[0] ?? '').toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
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
  if (scheme === 'http' && !localHost(host)) return false
  try {
    const expected = new URL(scheme + '://' + host).origin
    return new URL(origin).origin === expected
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
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Request refused' } })
    if (!checkOrigin(req)) return send(res, 403, { ok: false, error: { code: 'origin-refused', message: 'Request refused' } })
    const contentType = header(req, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return send(res, 415, { ok: false, error: { code: 'unsupported-media-type', message: 'Request refused' } })
    try {
      const body = JSON.parse(await readBody(req)) as unknown
      const result = await service.handle(parseVaultApiRequest(body))
      send(res, 200, result)
    } catch (error) {
      if (error instanceof BodyTooLargeError) return send(res, 413, { ok: false, error: { code: 'body-too-large', message: 'Request refused' } })
      return send(res, 400, { ok: false, error: { code: 'invalid-request', message: 'Request refused' } })
    }
  }
}
