import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createVaultApiHandler } from '../../src/host/api/handler.js'

function request(body: string, headers: Record<string, string>, method = 'POST', encrypted = false) {
  return Object.assign(Readable.from([body]), { method, headers, socket: { encrypted } }) as unknown as IncomingMessage
}

function response() {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let body = ''
  return {
    headers,
    get statusCode() { return statusCode },
    set statusCode(value: number) { statusCode = value },
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value },
    end(value?: string) { body = value ?? '' },
    get body() { return body },
  }
}

const service = { handle: async () => ({ ok: true, value: { revision: 0 } }) }

describe('Vault API handler', () => {
  it('accepts same-origin localhost JSON and emits no-store JSON', async () => {
    const res = response()
    await createVaultApiHandler(service as never)(
      request('{"action":"snapshot","clientInstanceId":"client-1"}', {
        host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080', 'content-type': 'application/json',
      }), res as unknown as ServerResponse,
    )
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(res.body)).toEqual({ ok: true, value: { revision: 0 } })
  })

  it('accepts same-origin HTTPS and rejects remote HTTP or mismatched origins', async () => {
    const httpsResponse = response()
    await createVaultApiHandler(service as never)(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: 'localhost:8080', origin: 'https://localhost:8080', 'content-type': 'application/json' }, 'POST', true), httpsResponse as unknown as ServerResponse)
    expect(httpsResponse.statusCode).toBe(200)

    const remoteHttps = response()
    await createVaultApiHandler(service as never)(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: 'example.test:8443', origin: 'https://example.test:8443', 'content-type': 'application/json' }, 'POST', true), remoteHttps as unknown as ServerResponse)
    expect(remoteHttps.statusCode).toBe(200)

    const forwardedSpoof = response()
    await createVaultApiHandler(service as never)(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: 'example.test:8080', origin: 'https://example.test:8080', 'x-forwarded-proto': 'https', 'content-type': 'application/json' }), forwardedSpoof as unknown as ServerResponse)
    expect(forwardedSpoof.statusCode).toBe(403)

    const remote = response()
    await createVaultApiHandler(service as never)(request('{}', { host: '192.168.1.2:8080', origin: 'http://192.168.1.2:8080', 'content-type': 'application/json' }), remote as unknown as ServerResponse)
    expect(remote.statusCode).toBe(403)

    const mismatch = response()
    await createVaultApiHandler(service as never)(request('{}', { host: '127.0.0.1:8080', origin: 'http://evil.test', 'content-type': 'application/json' }), mismatch as unknown as ServerResponse)
    expect(mismatch.statusCode).toBe(403)

    const missingOrigin = response()
    await createVaultApiHandler(service as never)(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: 'localhost:8080', 'content-type': 'application/json' }), missingOrigin as unknown as ServerResponse)
    expect(missingOrigin.statusCode).toBe(403)
  })

  it('rejects non-POST, non-JSON, malformed and oversized requests with sanitized errors', async () => {
    const handler = createVaultApiHandler(service as never)
    for (const [req, expectedStatus] of [
      [request('{}', { host: 'localhost:8080', origin: 'http://localhost:8080', 'content-type': 'application/json' }, 'GET'), 405],
      [request('{}', { host: 'localhost:8080', origin: 'http://localhost:8080', 'content-type': 'text/plain' }), 415],
      [request('{"password":"super-secret"', { host: 'localhost:8080', origin: 'http://localhost:8080', 'content-type': 'application/json' }), 400],
      [request('x'.repeat(256 * 1024 + 1), { host: 'localhost:8080', origin: 'http://localhost:8080', 'content-type': 'application/json' }), 413],
    ] as const) {
      const res = response()
      await handler(req, res as unknown as ServerResponse)
      expect(res.statusCode).toBe(expectedStatus)
      expect(res.body).not.toContain('super-secret')
      expect(res.headers['cache-control']).toBe('no-store')
    }
  })
})
