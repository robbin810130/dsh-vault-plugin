import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const PLUGIN_ID = '@robbin810130/dsh-vault-plugin'

const CLIENT_MANIFEST = {
  platform: 'web',
  inject: [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-settings-plugins',
    '@deepseek-ai/dsh-client-ui-workspace',
    '@deepseek-ai/dsh-client-ui-conversation',
  ],
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-runtime/client',
    '@deepseek-ai/dsh-client-ui-primitives',
    'react',
    'react/jsx-runtime',
  ],
  immediately: true,
} as const

const SHARED_IDENTITY_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-settings-plugins',
  '@deepseek-ai/dsh-client-ui-primitives',
  'react',
] as const

interface ClientBundleRegistration {
  readonly id: string
  readonly factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

interface StyleElement {
  readonly dataset: Record<string, string>
  textContent: string
  setAttribute(name: string, value: string): void
}

describe('DSH client artifact', () => {
  it('declares the exact browser module graph contract', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { dsh?: { client?: unknown } }

    expect(manifest.dsh?.client).toEqual(CLIENT_MANIFEST)
  })

  it('emits a DSH loader factory without unresolved browser imports or duplicated shared identities', async () => {
    const code = await readFile(new URL('../../lib/client.js', import.meta.url), 'utf8')
    const sourceMap = JSON.parse(
      await readFile(new URL('../../lib/client.js.map', import.meta.url), 'utf8'),
    ) as { sources?: unknown }

    expect(code).toContain('window.__ModuleLoader__.load({')
    expect(code).toContain(`id: ${JSON.stringify(PLUGIN_ID)}`)
    expect(code).not.toMatch(/^import\s/m)
    expect(Array.isArray(sourceMap.sources)).toBe(true)

    const sources = sourceMap.sources as string[]
    for (const packageName of SHARED_IDENTITY_PACKAGES) {
      expect(sources.some(source => source.includes(`/node_modules/${packageName}/`))).toBe(false)
    }
  })

  it('emits declarations for the client export', async () => {
    const declarations = await readFile(new URL('../../lib/client.d.ts', import.meta.url), 'utf8')

    expect(declarations).toContain('declare const inject: readonly string[]')
    expect(declarations).toContain('declare function apply(): void')
  })

  it('injects one plugin-tagged stylesheet when the factory executes', async () => {
    const code = await readFile(new URL('../../lib/client.js', import.meta.url), 'utf8')
    const styles: StyleElement[] = []
    let registration: ClientBundleRegistration | undefined
    const document = {
      querySelector: (_selector: string) => styles[0] ?? null,
      createElement: (tagName: string): StyleElement => {
        if (tagName !== 'style') throw new Error(`unexpected element: ${tagName}`)
        const dataset: Record<string, string> = {}
        return {
          dataset,
          textContent: '',
          setAttribute(name, value) {
            if (name === 'data-plugin') dataset.plugin = value
          },
        }
      },
      head: {
        appendChild(style: StyleElement) {
          styles.push(style)
          return style
        },
      },
    }
    const window = {
      __ModuleLoader__: {
        load(value: ClientBundleRegistration) {
          registration = value
        },
      },
    }

    Function('window', 'document', code)(window, document)
    expect(registration).toBeDefined()
    if (registration === undefined) throw new Error('client bundle did not register')

    const external = new Set<string>(CLIENT_MANIFEST.external)
    const moduleStub: (...args: unknown[]) => unknown = new Proxy(() => undefined, {
      apply: () => moduleStub,
      get: () => moduleStub,
    })
    const require = (specifier: string): unknown => {
      if (!external.has(specifier)) throw new Error(`unexpected require: ${specifier}`)
      return moduleStub
    }

    const firstExports = registration.factory(require)
    const secondExports = registration.factory(require)

    expect(registration.id).toBe(PLUGIN_ID)
    expect(firstExports.apply).toBeTypeOf('function')
    expect(secondExports.apply).toBeTypeOf('function')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.dataset.plugin).toBe(PLUGIN_ID)
    expect(styles[0]?.textContent).toContain('.dsh-vault')
  })
})
