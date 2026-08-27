import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VaultApiRequest, VaultSnapshot } from '../../src/shared/contracts.js'
import { createVaultApiClient } from '../../src/client/api.js'

const snapshot: VaultSnapshot = {
  revision: 3,
  policy: {
    autoLockMinutes: 15,
    lockOnSystemSleep: true,
    lockedNameVisibility: 'workspace-visible-session-hidden',
    failedAttemptProtection: { enabled: true, maxAttempts: 3, cooldownSeconds: 300 },
    passwordPolicy: { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false },
  },
  groups: [{
    id: 'group-1',
    name: 'Primary',
    credentialVersion: 1,
    recoveryConfigured: true,
    recoveryGeneratedAt: '2026-08-25T00:00:00.000Z',
    memberCount: 1,
  }],
  bindings: [{
    targetType: 'workspace',
    targetId: 'workspace-1',
    mode: 'direct',
    passwordGroupId: 'group-1',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
  }],
}

const request: VaultApiRequest = { action: 'snapshot', clientInstanceId: 'client-1' }

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Vault browser API client', () => {
  it('posts JSON to the fixed same-origin no-store route and forwards the AbortSignal', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init })
      return jsonResponse({ ok: true, value: snapshot })
    }
    const controller = new AbortController()

    const result = await createVaultApiClient(fetcher).call<VaultSnapshot>(request, controller.signal)

    expect(result).toEqual({ ok: true, value: snapshot })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input).toBe('/dsh-vault/api')
    expect(calls[0]!.init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    })
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual(request)
  })

  it('lets an AbortSignal cancel fetch while returning only a sanitized failure', async () => {
    let receivedSignal: AbortSignal | undefined
    const fetcher: typeof fetch = async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      receivedSignal = init?.signal ?? undefined
      receivedSignal?.addEventListener('abort', () => {
        reject(new DOMException('request body must not leak', 'AbortError'))
      }, { once: true })
    })
    const controller = new AbortController()
    const pending = createVaultApiClient(fetcher).call<VaultSnapshot>(request, controller.signal)

    controller.abort()

    await expect(pending).resolves.toEqual({
      ok: false,
      error: { code: 'request-aborted', message: 'Vault request aborted' },
    })
    expect(receivedSignal).toBe(controller.signal)
  })

  it('fails closed for non-2xx, network, malformed JSON, and malformed result bodies', async () => {
    const secret = 'correct horse battery staple'
    const cases: Array<{
      name: string
      fetcher: typeof fetch
      code: string
    }> = [
      {
        name: 'non-2xx',
        fetcher: async () => jsonResponse({ ok: false, error: { code: 'bad', message: secret } }, 503),
        code: 'host-unavailable',
      },
      {
        name: 'network rejection',
        fetcher: async () => { throw new Error(`network echoed ${secret}`) },
        code: 'host-unavailable',
      },
      {
        name: 'malformed JSON',
        fetcher: async () => new Response(`{"password":"${secret}"`, { status: 200 }),
        code: 'invalid-response',
      },
      {
        name: 'malformed envelope',
        fetcher: async () => jsonResponse({ ok: true }),
        code: 'invalid-response',
      },
      {
        name: 'snapshot carrying a forbidden extra field',
        fetcher: async () => jsonResponse({
          ok: true,
          value: {
            ...snapshot,
            groups: [{ ...snapshot.groups[0], password: secret }],
          },
        }),
        code: 'invalid-response',
      },
    ]
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    for (const candidate of cases) {
      const result = await createVaultApiClient(candidate.fetcher).call<VaultSnapshot>(request)
      expect(result, candidate.name).toMatchObject({ ok: false, error: { code: candidate.code } })
      expect(JSON.stringify(result), candidate.name).not.toContain(secret)
    }
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('preserves only safe Host error fields and refuses malformed action-specific values', async () => {
    const secret = 'RECOVERY-SECRET'
    const hostError = createVaultApiClient(async () => jsonResponse({
      ok: false,
      error: { code: 'cooldown', message: `echo ${secret}`, retryAt: 123_456 },
    }))

    await expect(hostError.call<VaultSnapshot>(request)).resolves.toEqual({
      ok: false,
      error: { code: 'cooldown', message: 'Vault operation failed', retryAt: 123_456 },
    })

    const malformedUnlock = createVaultApiClient(async () => jsonResponse({
      ok: true,
      value: {
        grant: { groupId: 'group-1', credentialVersion: 1, token: secret },
        expiresAt: 1000,
      },
    }))
    const result = await malformedUnlock.call({
      action: 'unlock',
      clientInstanceId: 'client-1',
      groupId: 'group-1',
      password: 'correct horse',
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid-response', message: 'Vault response refused' },
    })
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})
