// What the profile actually receives: the package manifest, the built bundle and
// the files that travel with it.
//
// The bundle is not merely checked for existence — it is executed the way the shell
// executes it (`window.__ModuleLoader__.load`) and mounted on a fake client context,
// so a wrapper that registers nothing fails here and not on the settings page.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const run = promisify(execFile)

const loadJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'))

/** Is `file` carried by the `files` list (an entry ending in `/` matches a directory)? */
const carried = (manifest, file) => manifest.files.some(
  (entry) => entry === file || (entry.endsWith('/') && file.startsWith(entry)),
)

test('the manifest declares a web client half next to the bundle', async () => {
  const manifest = await loadJson('package.json')

  assert.equal(manifest.name, '@dr-co/dsh-speech-gate')
  assert.equal(manifest.version, '0.4.0')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.deepEqual(manifest.dsh.client, {
    inject: ['@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-settings'],
    platform: 'web',
  })
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.scripts.build, 'node scripts/build-client.mjs')
})

test('every exported file is carried by the package, the client bundle included', async () => {
  const manifest = await loadJson('package.json')
  const targets = [manifest.main, ...Object.values(manifest.exports)]
    .map((file) => file.replace(/^\.\//u, ''))
    // npm always packs package.json; `files` does not list it and must not need to.
    .filter((file) => file !== 'package.json')

  for (const file of targets) {
    assert.ok(carried(manifest, file), `${file} is exported but not listed in files`)
  }
  // The failure this guards: a package published without `lib/`, which installs
  // cleanly and leaves the settings page without a card.
  assert.ok(carried(manifest, 'lib/client.js'), 'lib/ must be in files so lib/client.js ships')
  assert.ok(carried(manifest, 'routes.mjs'), 'routes.mjs must be in files: the card has no server without it')
})

test('every relative module the package imports is carried too', async () => {
  const manifest = await loadJson('package.json')
  for (const entry of manifest.files) {
    if (!entry.endsWith('.mjs')) continue
    const file = path.join(root, entry)
    if (!existsSync(file)) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/from\s+'(\.\/[^']+)'/gu)) {
      const target = match[1].replace(/^\.\//u, '')
      assert.ok(carried(manifest, target), `${entry} imports ${target}, which files does not carry`)
    }
  }
})

test('the built bundle is a loader registration for this package, and it mounts', async () => {
  const manifest = await loadJson('package.json')
  const source = readFileSync(path.join(root, 'lib/client.js'), 'utf8')

  let registration = null
  const window = { __ModuleLoader__: { load: (entry) => { registration = entry } } }
  // The shell evaluates the bundle as a script; so does this test.
  new Function('window', source)(window)

  assert.equal(registration?.id, manifest.name)
  assert.equal(typeof registration.factory, 'function')

  // The module table the shell seeds: react plus (here) nothing else.
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    Component: class { constructor(props) { this.props = props } },
    useEffect: () => {},
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  const exports = registration.factory((name) => {
    if (name === 'react') return React
    throw new Error(`the client bundle required an unexpected module: ${name}`)
  })

  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots', 'locale'])

  // Mount it the way the host does and look at what it registered.
  const sections = []
  const languages = []
  const dictionaries = []
  const ctx = {
    locale: {
      bind: (ns) => (key) => `${ns}:${key}`,
      register: (ns, language) => { dictionaries.push({ ns, language }) },
      addLanguage: (language) => { languages.push(language.id); return () => {} },
    },
    effect: (callback) => callback(),
    slots: {
      inject: (name, callback) => callback(),
      register: (options, component) => {
        sections.push({ ...options, component })
        return () => {}
      },
    },
  }
  exports.apply(ctx)

  assert.deepEqual(sections.map((section) => [section.name, section.id, section.order]), [
    ['settings.section', 'speech-gate', 40],
    ['settings.section.icon', 'speech-gate', 40],
  ])
  for (const section of sections) {
    assert.equal(typeof section.component, 'function')
    assert.equal(section.label(), 'dsh-speech-gate:nav.title')
  }
  // The page gets `t` only because the section declares its dictionary; an icon is
  // drawn from `currentColor` and needs no translation.
  assert.equal(sections[0].locale, 'dsh-speech-gate')
  assert.equal(sections[1].locale, undefined)
  assert.deepEqual(dictionaries.map((entry) => entry.language).sort(), ['en', 'ru', 'zh'])
  assert.deepEqual(languages, ['ru'])
})

test('npm pack ships lib/client.js and routes.mjs — the lesson from the previous release', async () => {
  const { stdout } = await run('npm', ['pack', '--dry-run', '--json'], { cwd: root, timeout: 120_000 })
  const [report] = JSON.parse(stdout)
  const packed = report.files.map((file) => file.path)

  for (const file of ['index.mjs', 'routes.mjs', 'lib/client.js', 'cordis.patch.yml']) {
    assert.ok(packed.includes(file), `${file} is missing from the packed tarball`)
  }
  // The sources stay out of the tarball — `lib/client.js` is what ships — but the
  // server half of the card has to be there, or the bundle has nowhere to talk to.
  assert.equal(packed.some((file) => file.startsWith('src/')), false, 'sources are not part of the package');
})
