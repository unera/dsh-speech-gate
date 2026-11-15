// The speech gate card, rendered for real: no DOM, no browser, no bundler.
//
// `src/client/card.js` is evaluated with `react` and `./api.js` replaced by this
// file's own stubs, so the components run for real — hooks included, in a tiny
// render loop — and the host's answers are what the test controls. A card that
// throws while the host boundary swallows it looks like a blank settings page, not
// like a bug, which is why the rendering is exercised and not just the helpers.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { DICTIONARIES } from '../src/client/locales.js'
import { CSS } from '../src/client/styles.js'

const root = fileURLToPath(new URL('..', import.meta.url))

/** The Russian dictionary, so the assertions read the text a person actually sees. */
const t = (key) => DICTIONARIES.ru[key] ?? key

/* Fixtures are what `/state` answers: a record of ours with a key, one of ours
 * without, a model connector and — never sent, because it takes no key — a local
 * command. The card hardcodes neither the names nor the kinds. */
const YANDEX_WITH_KEY = {
  id: 'yandex-stt',
  name: 'Yandex SpeechKit (облако)',
  provider: 'yandex',
  apiKeyRef: 'YANDEX_SPEECHKIT_API_KEY',
  connectorRef: null,
  keyPresent: true,
  keySource: 'own',
}
const YANDEX_WITHOUT_KEY = {
  id: 'yandex-new',
  name: 'Yandex SpeechKit, второй',
  provider: 'yandex',
  apiKeyRef: 'STT_KEY_YANDEX_NEW',
  connectorRef: null,
  keyPresent: false,
  keySource: null,
}
const CONNECTOR = {
  id: 'openai',
  name: 'OpenAI gpt-4o-transcribe',
  provider: 'openai',
  apiKeyRef: 'STT_KEY_OPENAI',
  connectorRef: 'OPENAI_API_KEY',
  keyPresent: true,
  keySource: 'connector',
}
const CONNECTOR_NO_NAME = {
  id: 'unknown-family',
  name: 'Some model',
  provider: null,
  apiKeyRef: 'STT_KEY_UNKNOWN_FAMILY',
  connectorRef: null,
  keyPresent: false,
  keySource: null,
}

const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children })

/** Every node of a rendered tree, in document order. */
function flat(node, out = []) {
  if (node === null || node === undefined || node === false) return out;
  if (Array.isArray(node)) {
    for (const child of node) flat(child, out);
    return out;
  }
  if (typeof node !== 'object' || typeof node.type === 'undefined') return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

/**
 * Render function components, so a tree holds elements only.
 *
 * The live card returns `h(SpeechGateView, ...)` — an element whose type is a
 * function — and walking its children without calling that function walks nothing.
 * A class component is left alone: it is mounted by the host, not by this helper.
 * @param node - an element, or an array of them.
 * @returns the same tree with function components replaced by what they render.
 */
function expandTree(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(expandTree);
  if (typeof node.type === 'function' && !/^class/u.test(String(node.type))) {
    return expandTree(node.type(node.props ?? {}));
  }
  return { ...node, children: node.children.map(expandTree) };
}

const byType = (tree, type) => flat(tree).filter((node) => node.type === type);
const byClass = (tree, className) => flat(tree).filter(
  (node) => String(node.props?.className ?? '').split(/\s+/u).includes(className),
);

/** All the text under a node, joined — what a person reads. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node !== 'object') return '';
  return textOf(node.children);
}

/**
 * Evaluate `src/client/card.js` with its imports and exports replaced by stubs.
 * @param options - the symbols to inject: hooks, `h` and the two calls.
 * @returns the module's exports.
 */
async function loadCard(options = {}) {
  const source = await readFile(path.join(root, 'src/client/card.js'), 'utf8');
  const body = source
    .replace(/^import .*$/gmu, '')
    .replace(/^export const (\w+)/gmu, 'const $1 = module.exports.$1')
    .replace(/^export function (\w+)\s*\(/gmu, 'const $1 = module.exports.$1 = function $1(')
    .replace(/^export class (\w+)/gmu, 'const $1 = module.exports.$1 = class $1');
  const factory = new Function(
    'h',
    'Component',
    'useEffect',
    'useState',
    'getState',
    'saveCredential',
    `
    const module = { exports: {} };
    ${body}
    return module.exports;
    `,
  );
  return factory(
    options.h ?? createElement,
    options.Component ?? class { constructor(props) { this.props = props } },
    options.useEffect ?? (() => {}),
    options.useState ?? ((initial) => [typeof initial === 'function' ? initial() : initial, () => {}]),
    options.getState ?? (async () => ({ providers: [] })),
    options.saveCredential ?? (async () => ({ ok: true, present: true })),
  );
}

const flush = async () => {
  for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

test('a snapshot becomes rows, and junk is dropped instead of drawn', async () => {
  const card = await loadCard();
  const rows = card.providerRows({
    providers: [
      YANDEX_WITH_KEY,
      null,
      { id: '', name: 'no id' },
      { id: 'no-name', apiKeyRef: 'STT_KEY_NO_NAME' },
      { id: 'old-host', apiKeyRef: 'STT_KEY_OLD', connectorRef: 'OPENAI_API_KEY', keySource: 'connector' },
      CONNECTOR,
    ],
  });

  assert.deepEqual(rows.map((row) => row.id), ['yandex-stt', 'no-name', 'old-host', 'openai']);
  // A row without a name is called after its id: an empty line tells nothing.
  assert.equal(rows[1].name, 'no-name');
  // A host that sent no source is read as a row without one, never as a made-up
  // "own": the chip then says there is no key, which is true.
  assert.equal(rows[2].keySource, 'connector');
  assert.equal(rows[2].connectorRef, 'OPENAI_API_KEY');
  assert.equal(rows[1].keySource, null);
  assert.equal(rows[1].connectorRef, null);
  assert.equal(rows[0].keyPresent, true);
  assert.equal(rows[1].keyPresent, false);
});

test('every record with a name of its own gets a field', async () => {
  const card = await loadCard();
  assert.equal(card.showsKeyField({ apiKeyRef: 'STT_KEY_A' }), true);
  // A record that may fall back to the model connector still has a field: the
  // person asked for control over each place separately.
  assert.equal(card.showsKeyField({ apiKeyRef: 'STT_KEY_OPENAI', connectorRef: 'OPENAI_API_KEY' }), true);
  // A record without a name has nowhere to write: local commands never get here.
  assert.equal(card.showsKeyField({ apiKeyRef: null }), false);
  assert.equal(card.showsKeyField(null), false);
});

test('the yandex hint follows the configured service, with the id as a fallback', async () => {
  const card = await loadCard();
  assert.equal(card.isYandexProvider({ provider: 'yandex', id: 'whatever' }), true);
  assert.equal(card.isYandexProvider({ provider: null, id: 'yandex' }), true);
  assert.equal(card.isYandexProvider({ provider: 'openai', id: 'openai' }), false);
  assert.equal(card.isYandexProvider(null), false);
});

test('the card draws one line per record: name, id, key state', async () => {
  const card = await loadCard();
  const tree = card.SpeechGateView({ t, loading: false, providers: [YANDEX_WITH_KEY, YANDEX_WITHOUT_KEY, CONNECTOR] });

  const items = byType(tree, 'li');
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.props['data-provider']), ['yandex-stt', 'yandex-new', 'openai']);
  assert.deepEqual(items.map((item) => item.props['data-key-source']), ['own', 'none', 'connector']);

  const names = byClass(tree, 'dsg-provider-name').map(textOf);
  assert.deepEqual(names, ['Yandex SpeechKit (облако)', 'Yandex SpeechKit, второй', 'OpenAI gpt-4o-transcribe']);
  const ids = byClass(tree, 'dsg-provider-id').map(textOf);
  assert.deepEqual(ids, ['yandex-stt', 'yandex-new', 'openai']);

  // «ключ сохранён» / «ключ не задан», and the connector's own presence.
  const chips = flat(tree).filter((node) => node.props?.['data-key-state'] !== undefined);
  assert.deepEqual(chips.map((node) => node.props['data-key-state']), ['present', 'missing', 'present']);
  // The chip says where the working key lives: the connector's key is not ours.
  assert.deepEqual(chips.map(textOf), [
    'ключ сохранён',
    'ключ не задан',
    'ключ взят из настроек модели',
  ]);
});

test('the key field is a one-row textarea, not a password box', async () => {
  const card = await loadCard();
  const tree = card.SpeechGateView({ t, loading: false, providers: [YANDEX_WITHOUT_KEY], drafts: {} });

  const fields = byType(tree, 'textarea');
  assert.equal(fields.length, 1);
  const field = fields[0];
  assert.equal(field.props.rows, 1, 'a key is one line');
  assert.equal(field.props.autoComplete, 'off');
  assert.equal(field.props.spellCheck, false);
  assert.equal(field.props.type, undefined, 'no type at all: a password box would invite the password manager');
  assert.equal(field.props.value, '');
  assert.equal(String(field.props.className).includes('dsg-key-input'), true);

  // The stylesheet is what gives it the fixed height the row needs.
  const rule = CSS.match(/\.dsg-key-input \{[^}]*\}/u)?.[0] ?? '';
  assert.match(rule, /height: 30px/u);
  assert.match(rule, /line-height: 28px/u);
  assert.match(rule, /resize: none/u);
  assert.match(rule, /overflow: hidden/u);

  // One button per row, and it says what it does.
  const buttons = byType(tree, 'button');
  assert.equal(buttons.length, 1);
  assert.equal(textOf(buttons[0]), 'Сохранить ключ');
});

test('the name a key is stored under is shown as text, never as a field', async () => {
  const card = await loadCard();
  const tree = card.SpeechGateView({ t, loading: false, providers: [YANDEX_WITH_KEY], drafts: {} });

  // The only control on the row is the key field and its button: the name is
  // derived from the record id, so it is not something a person edits here.
  const inputs = flat(tree).filter((node) => node.type === 'input');
  assert.deepEqual(inputs, []);
  assert.equal(byType(tree, 'textarea').length, 1);
  const notes = byClass(tree, 'dsg-note').map(textOf);
  assert.ok(notes.includes(DICTIONARIES.ru['card.keyStoredAs'].replace('{0}', 'YANDEX_SPEECHKIT_API_KEY')), notes.join(' | '));
});

test('a SpeechKit row points at the console, another row does not', async () => {
  const card = await loadCard();
  const yandexTree = card.SpeechGateView({ t, loading: false, providers: [YANDEX_WITH_KEY] });
  const links = byType(yandexTree, 'a');
  assert.equal(links.length, 1);
  assert.equal(links[0].props.href, card.KEY_CONSOLE_URL);
  assert.equal(links[0].props.href, 'https://aistudio.yandex.cloud/platform/');
  assert.equal(links[0].props.target, '_blank');
  assert.equal(links[0].props.rel, 'noreferrer');
  assert.equal(textOf(links[0]), 'Консоль Yandex AI Studio');
  const hint = byClass(yandexTree, 'dsg-hint').map(textOf).join('');
  assert.match(hint, /Где взять ключ/u);
  assert.match(hint, /сервисный аккаунт → API-ключ/u);

  // An OpenAI-compatible record has no console of ours to point at.
  const apiRow = { id: 'whisper-local', name: 'Local whisper server', provider: null, kind: 'key', apiKeyRef: 'STT_KEY_WHISPER_LOCAL', keyPresent: false };
  const other = card.SpeechGateView({ t, loading: false, providers: [apiRow] });
  assert.deepEqual(byType(other, 'a'), []);
  assert.deepEqual(byClass(other, 'dsg-hint'), []);
});

test('a connector row offers the field and says it may stay empty', async () => {
  const card = await loadCard();
  const tree = card.SpeechGateView({ t, loading: false, providers: [CONNECTOR, CONNECTOR_NO_NAME] });

  // Both records have a name of their own, so both have a field.
  assert.equal(byType(tree, 'textarea').length, 2);
  assert.equal(byType(tree, 'button').length, 2);
  const notes = byClass(tree, 'dsg-note').map(textOf).join('\n');
  // The connector row names the fallback and says the field is optional.
  assert.match(notes, /можно не заполнять — тогда ключ берётся из настроек модели \(OPENAI_API_KEY\)/u);
  // A record with no connector behind it says nothing of the sort.
  const alone = card.SpeechGateView({ t, loading: false, providers: [CONNECTOR_NO_NAME] });
  assert.doesNotMatch(byClass(alone, 'dsg-note').map(textOf).join('\n'), /можно не заполнять/u);
});

test('loading, an empty state and a failed read each say something', async () => {
  const card = await loadCard();
  const loading = card.SpeechGateView({ t, loading: true, providers: [] });
  assert.match(textOf(loading), /Загружаю распознаватели/u);

  const empty = card.SpeechGateView({ t, loading: false, providers: [] });
  assert.match(textOf(empty), /ключ не нужен/u);

  const failed = card.SpeechGateView({ t, loading: false, providers: [], error: 'нет связи' });
  assert.match(textOf(failed), /Не удалось сохранить: нет связи/u);
  // The one sentence about the shared SpeechKit key is always there.
  assert.match(textOf(empty), /Ключ SpeechKit один и тот же/u);
});

/**
 * Mount the live card: a render loop with just enough of React.
 *
 * The promises the card awaits settle between renders, so the test drives the real
 * state machine — initial load, a click, the host's answer — instead of guessing.
 * Effects are run once each, addressed by their hook position, because a fresh
 * closure is created on every render and identity would run them all over again.
 * @param options - `getState` and `saveCredential` stubs.
 * @returns `{ render }`, which draws the card and returns its tree.
 */
async function mountLive({ getState, saveCredential }) {
  const slots = [];
  const ran = new Set();
  let pending = [];
  let cursor = 0;

  const useState = (initial) => {
    const index = cursor;
    cursor += 1;
    if (slots[index] === undefined) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
  };
  const useEffect = (effect) => {
    const index = cursor;
    cursor += 1;
    pending.push({ index, effect });
  };

  const card = await loadCard({ useState, useEffect, getState, saveCredential });
  const render = () => {
    cursor = 0;
    pending = [];
    const tree = expandTree(card.SpeechGateCard({ t }));
    const now = pending;
    pending = [];
    for (const { index, effect } of now) {
      if (ran.has(index)) continue;
      ran.add(index);
      effect();
    }
    return tree;
  };
  return { render };
}

test('a save answers «ключ сохранён» without keeping the value', async () => {
  const stateCalls = [];
  const saved = [];
  const mounted = await mountLive({
    getState: async () => { stateCalls.push(1); return { providers: [YANDEX_WITHOUT_KEY] }; },
    saveCredential: async (ref, value) => { saved.push({ ref, value }); return { ok: true, ref, present: true }; },
  });

  mounted.render();
  await flush();
  let tree = mounted.render();
  assert.equal(byType(tree, 'textarea')[0].props.value, '');

  // Typing puts the value in the field and nowhere else.
  byType(tree, 'textarea')[0].props.onChange({ target: { value: '  fresh-key  ' } });
  tree = mounted.render();
  assert.equal(byType(tree, 'textarea')[0].props.value, '  fresh-key  ');

  // Saving sends it trimmed and empties the field: nothing typed is kept here.
  byType(tree, 'button')[0].props.onClick();
  await flush();
  tree = mounted.render();
  assert.deepEqual(saved, [{ ref: 'STT_KEY_YANDEX_NEW', value: 'fresh-key' }]);
  assert.equal(byType(tree, 'textarea')[0].props.value, '');
  assert.match(textOf(tree), /ключ сохранён/u);
  // The chip is re-read from the host, not assumed: a second /state.
  assert.equal(stateCalls.length, 2);
});

test('an empty field with a stored key answers «ключ не изменён»', async () => {
  const saved = [];
  const mounted = await mountLive({
    getState: async () => ({ providers: [YANDEX_WITH_KEY] }),
    saveCredential: async (ref, value) => {
      saved.push({ ref, value });
      return { ok: true, ref, present: true, unchanged: true };
    },
  });

  mounted.render();
  await flush();
  let tree = mounted.render();
  // The field starts empty although the key is there: a stored value is never
  // drawn back into the card.
  assert.equal(byType(tree, 'textarea')[0].props.value, '');
  byType(tree, 'button')[0].props.onClick();
  await flush();
  tree = mounted.render();

  assert.deepEqual(saved, [{ ref: 'YANDEX_SPEECHKIT_API_KEY', value: '' }]);
  assert.match(textOf(tree), /ключ не изменён/u);
});

test('a refused save shows the host\'s sentence under its own row', async () => {
  const mounted = await mountLive({
    getState: async () => ({ providers: [YANDEX_WITHOUT_KEY] }),
    saveCredential: async () => { throw new Error('значение ключа пустое'); },
  });

  mounted.render();
  await flush();
  let tree = mounted.render();
  byType(tree, 'button')[0].props.onClick();
  await flush();
  tree = mounted.render();

  assert.deepEqual(byClass(tree, 'dsg-error').map(textOf), ['Не удалось сохранить: значение ключа пустое']);
});
