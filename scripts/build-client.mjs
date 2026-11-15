/**
 * Client build: bundle the browser half into the harness' plugin-bundle format.
 *
 * A DSH client bundle is not an ES module the page imports — it is a script that
 * registers a factory with `window.__ModuleLoader__.load({ id, factory })`, where
 * `factory(require)` returns the bundle's exports and `require` resolves only the
 * module table the shell seeds (react and the harness' own client packages). This
 * script produces the JS with esbuild and writes that wrapper around it, the same
 * way `@dr-co/dsh-text-to-speech` and `@dr-co/dsh-websearch` do.
 *
 * The output path is `lib/client.js` because that is what `exports["./client"]`
 * points at — and `lib/` is in `files`, so the published package carries it.
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

const result = await build({
  entryPoints: [join(root, 'src/client/index.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome110'],
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  write: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info'
})

const bundled = result.outputFiles?.[0]?.text
if (typeof bundled !== 'string' || bundled === '') throw new Error('dsh-speech-gate: esbuild produced no client bundle')

const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(manifest.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${bundled}
    return module.exports;
  }
});
`

const outfile = join(root, 'lib/client.js')
await mkdir(dirname(outfile), { recursive: true })
await writeFile(outfile, wrapped, 'utf8')
console.log(`dsh-speech-gate: client bundle written to ${outfile} (${wrapped.length} bytes)`)
