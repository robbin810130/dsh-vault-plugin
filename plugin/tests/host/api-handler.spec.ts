import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createVaultApiHandler } from '../../src/host/api/handler.js'

function request(body: string, headers: Record<string, string | readonly string[]>, method = 'POST', encrypted = false, remoteAddress = '127.0.0.1') {
  return Object.assign(Readable.from([body]), { method, headers, socket: { encrypted, remoteAddress } }) as unknown as IncomingMessage
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
  it('refuses a password-group creation replay without a fresh intent', async () => {
    const res = response()
    await createVaultApiHandler(service as never)(
      request(JSON.stringify({
        action: 'group-create', clientInstanceId: 'client-1', expectedRevision: 0, grants: [],
        input: { name: 'Primary', password: 'correct horse', bindings: [] },
      }), {
        host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080', 'content-type': 'application/json',
      }), res as unknown as ServerResponse,
    )

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      error: { code: 'create-intent-refused', message: 'Request refused' },
    })
  })

  it('accepts a fresh create intent once and then refuses its replay', async () => {
    const calls: unknown[] = []
    const handler = createVaultApiHandler({ handle: async (request: unknown) => { calls.push(request); return { ok: true, value: { revision: 1 } } } } as never)
    const headers = { host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080', 'content-type': 'application/json' }
    const issued = response()
    await handler(request('{"action":"group-create-intent","clientInstanceId":"client-1"}', headers), issued as unknown as ServerResponse)
    const intent = JSON.parse(issued.body).value.intent as string

    const body = JSON.stringify({
      action: 'group-create', clientInstanceId: 'client-1', expectedRevision: 0, grants: [], intent,
      input: { name: 'Primary', password: 'correct horse', bindings: [] },
    })
    const accepted = response()
    await handler(request(body, headers), accepted as unknown as ServerResponse)
    expect(accepted.statusCode).toBe(200)
    expect(calls).toHaveLength(1)

    const replayed = response()
    await handler(request(body, headers), replayed as unknown as ServerResponse)
    expect(replayed.statusCode).toBe(400)
  })

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
    await createVaultApiHandler(service as never)(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: 'example.test:8443', origin: 'https://example.test:8443', 'content-type': 'application/json' }, 'POST', true, '192.168.1.20'), remoteHttps as unknown as ServerResponse)
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

  it('requires HTTP requests to come from loopback and rejects host/origin tricks and duplicate headers', async () => {
    const handler = createVaultApiHandler(service as never)
    for (const remoteAddress of ['127.0.0.1', '127.42.9.8', '::1', '::ffff:127.0.0.1']) {
      const res = response()
      await handler(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: 'localhost:8080', origin: 'http://localhost:8080', 'content-type': 'application/json' }, 'POST', false, remoteAddress), res as unknown as ServerResponse)
      expect(res.statusCode, remoteAddress).toBe(200)
    }

    const remote = response()
    await handler(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: 'localhost:8080', origin: 'http://localhost:8080', 'content-type': 'application/json' }, 'POST', false, '192.168.1.20'), remote as unknown as ServerResponse)
    expect(remote.statusCode).toBe(403)

    const userInfo = response()
    await handler(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: '[::1]@evil.test', origin: 'http://[::1]@evil.test', 'content-type': 'application/json' }, 'POST', false, '127.0.0.1'), userInfo as unknown as ServerResponse)
    expect(userInfo.statusCode).toBe(403)

    for (const [name, values] of [['origin', ['http://localhost:8080', 'http://localhost:8080']], ['host', ['localhost:8080', 'localhost:8080']]] as const) {
      const duplicate = response()
      await handler(request('{"action":"snapshot","clientInstanceId":"client-1"}', { host: 'localhost:8080', origin: 'http://localhost:8080', 'content-type': 'application/json', [name]: values }, 'POST', false, '127.0.0.1'), duplicate as unknown as ServerResponse)
      expect(duplicate.statusCode, name).toBe(403)
    }
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
