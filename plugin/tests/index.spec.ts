import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.js'

describe('Vault plugin Cordis integration', () => {
  let root: string | undefined

  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  })

  it('declares webServer injection and activates only after the dependency is available', async () => {
    expect(apply.inject).toEqual(['webServer'])
    root = await mkdtemp(join(tmpdir(), 'dsh-vault-plugin-'))
    const registrations: unknown[] = []
    const ctx = new Context()
    const fiber = ctx.plugin(apply, { stateDir: join(root, 'vault-lock') })

    await Promise.resolve()
    expect(registrations).toEqual([])

    const disposeWebServer = ctx.provide('webServer', {
      register: (route: unknown) => {
        registrations.push(route)
        return () => undefined
      },
    } as never)
    await fiber
    expect(registrations).toHaveLength(1)
    expect((registrations[0] as { path: string }).path).toBe('/dsh-vault/api')

    await fiber.dispose()
    disposeWebServer()
  })
})
