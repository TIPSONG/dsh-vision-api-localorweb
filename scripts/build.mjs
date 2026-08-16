/**
 * Build script for dsh-vision-api-localorweb.
 *
 * Produces two artifacts:
 *  - lib/index.js  (ESM): the Host half — a Cordis entry (`name`/`inject`/`apply`).
 *  - lib/client.js (CJS, `__ModuleLoader__.load` wrapped): the Client half.
 *
 * The client bundle follows the `@deepseek-ai/dsh-client-modules` contract:
 * `window.__ModuleLoader__.load({ id, factory })` where `factory(require)`
 * returns `{ name, inject, apply }`. Official plugins externalize every
 * `@deepseek-ai/*` and `react` import: they resolve at runtime through the
 * module loader (seed words / already-registered bundles), never from npm.
 *
 * Usage: `node scripts/build.mjs`
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const external = [
  '@deepseek-ai/*',
  'react',
  'react/*',
  'react-dom',
  'react-dom/*',
  'node:*',
]

/** The client bundle id must match package.json `name`. */
const CLIENT_ID = 'dsh-vision-api-localorweb'

const shared = {
  bundle: true,
  sourcemap: false,
  logLevel: 'info',
  external,
  define: { 'process.env.NODE_ENV': '"production"' },
}

// --- Host half: ESM entry ---------------------------------------------------
await build({
  ...shared,
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'lib/index.js'),
  format: 'esm',
  platform: 'node',
  target: ['node18'],
})

// --- Client half: CJS, wrapped in __ModuleLoader__.load ---------------------
await build({
  ...shared,
  entryPoints: [resolve(root, 'src/client.ts')],
  outfile: resolve(root, 'lib/client.js'),
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  // The dsh client module loader contract: register a factory that returns the
  // plugin object; the kernel calls apply(ctx) on mount.
  banner: {
    js: `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(CLIENT_ID)},\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n`,
  },
  footer: {
    js: `\n    return module.exports;\n  }\n});\n`,
  },
})

console.log('built lib/index.js (host) and lib/client.js (client)')
