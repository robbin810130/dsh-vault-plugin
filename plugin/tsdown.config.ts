import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'

const PLUGIN_ID = '@robbin810130/dsh-vault-plugin'
const CLIENT_CSS_PREFIX = '\0dsh-vault-css:'
const CLIENT_CSS_SUFFIX = '.mjs'
const CLIENT_EXTERNALS = new Set([
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-primitives',
  'react',
  'react/jsx-runtime',
])

export default defineConfig([
  {
    name: PLUGIN_ID,
    entry: ['src/index.ts', 'src/cli.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    tsconfig: 'tsconfig.client.json',
    fixedExtension: false,
    dts: {
      compilerOptions: { noEmit: false },
    },
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: specifier => CLIENT_EXTERNALS.has(specifier),
      alwaysBundle: specifier => !CLIENT_EXTERNALS.has(specifier),
    },
    plugins: [{
      name: 'dsh-vault-client-css',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || importer === undefined) return null
        return CLIENT_CSS_PREFIX + resolve(dirname(importer), source) + CLIENT_CSS_SUFFIX
      },
      async load(id: string) {
        if (!id.startsWith(CLIENT_CSS_PREFIX)) return null
        const file = id.slice(CLIENT_CSS_PREFIX.length, -CLIENT_CSS_SUFFIX.length)
        this.addWatchFile(file)
        const source = await readFile(file)
        const { code } = transform({ filename: file, code: source, minify: true })
        const selector = `style[data-plugin=${JSON.stringify(PLUGIN_ID)}]`
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `if (typeof document !== 'undefined' && document.querySelector(${JSON.stringify(selector)}) === null) {`,
          "  const tag = document.createElement('style');",
          `  tag.setAttribute('data-plugin', ${JSON.stringify(PLUGIN_ID)});`,
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          'export {};',
        ].join('\n')
      },
    }],
    outputOptions: (options, _format, { cjsDts }) => cjsDts
      ? {
          ...options,
          entryFileNames: chunk => chunk.name.endsWith('.d') ? 'client.d.ts' : 'client.js',
        }
      : {
          ...options,
          entryFileNames: 'client.js',
          banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
          intro: 'var module = { exports: {} }; var exports = module.exports;',
          footer: 'return module.exports; } });',
        },
  },
])
