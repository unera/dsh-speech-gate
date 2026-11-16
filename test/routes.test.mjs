// The card's own two routes, driven with real Requests and a fake store.
//
// What is worth a test here is not the plumbing but the rules a person would hit:
// which rows are shown, where a key's presence comes from, and the two different
// answers to an empty field. The value of a key is checked to stay out of every
// answer and every log line, because that is the one mistake that cannot be undone.
import assert from 'node:assert/strict'
import test from 'node:test'

import { applyEnabled, assignApiKeyRefs, createProviderGate, normalizeConfig } from '../index.mjs'
import {
  BASE_PATH,
  CREDENTIAL_REF_PATTERN,
  createHandler,
  credentialFrom,
  enabledFrom,
  mountRoutes,
  refPresent,
  stateOf,
  statusOf,
} from '../routes.mjs'

/** The four kinds of record the card meets, normalized and given their names. */
function configuredProviders() {
  const { providers } = normalizeConfig({
    providers: [
      // Ours, with the name spelled out — the synthesizer's SpeechKit key.
      { id: 'yandex-stt', provider: 'yandex', apiKeyRef: 'YANDEX_SPEECHKIT_API_KEY' },
      // Ours, with no name: one has to be generated.
      { id: 'yandex-new', provider: 'yandex' },
      // A model connector record: a name of its own, plus the connector behind it.
      { id: 'openai', backend: 'configured-model', model: 'whisper-1' },
      // A local command: no key at all, so no row.
      { id: 'local-command', backend: 'exec', command: 'whisper-cli' },
    ],
  });
  return applyEnabled(assignApiKeyRefs(providers, {}).providers, {});
}

/** A `speechToText` registry that keeps what is registered right now. */
function fakeSpeechToText() {
  const registered = new Set();
  return {
    registered,
    register(provider) {
      if (registered.has(provider.info.id)) throw new Error(`Speech provider already registered: ${provider.info.id}`);
      registered.add(provider.info.id);
      // The Host's disposer is async and idempotent; both facts are relied upon.
      return async () => { registered.delete(provider.info.id); };
    },
  };
}

/**
 * A live gate over the same records the routes are given.
 * @param providers - the configured records.
 * @param values - what the credentials store holds.
 * @returns the gate, the store, the registry and the profile writes.
 */
async function gateOver(providers, values = {}) {
  const store = fakeStore(values);
  const speechToText = fakeSpeechToText();
  const persisted = [];
  const gate = createProviderGate({ speechToText }, {
    credentials: () => store,
    persist: async (map) => { persisted.push({ ...map }); return true; },
  });
  await gate.load(providers, {});
  return { gate, store, speechToText, persisted };
}

/**
 * A credentials store as this plugin meets it: `resolve()` for presence, `set()`
 * for a write, and a record of every call so a test can see what was asked.
 */
function fakeStore(values = {}) {
  const store = {
    values: { ...values },
    calls: [],
    async resolve(ref) {
      store.calls.push({ op: 'resolve', ref });
      return Object.hasOwn(store.values, ref) ? { value: store.values[ref] } : undefined;
    },
    async set(ref, value) {
      store.calls.push({ op: 'set', ref, value });
      store.values[ref] = value;
    },
  };
  return store;
}

const handlerWith = (store, options = {}) => createHandler(configuredProviders(), {
  credentials: () => store,
  log: options.log ?? (() => {}),
  warn: options.warn ?? (() => {}),
});

const get = (handler) => handler(new Request(`http://localhost${BASE_PATH}/state`));

const post = (handler, body, path = `${BASE_PATH}/credential`) => handler(new Request(`http://localhost${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}));

test('the state lists every recognizer, local and unconfigured ones included', async () => {
  const store = fakeStore({ YANDEX_SPEECHKIT_API_KEY: 'working-key' });
  const answer = await get(handlerWith(store));
  assert.equal(answer.status, 200);
  const state = await answer.json();

  // A local command is a row too: the card has to say "no key needed" instead of
  // leaving a person to wonder where its key field went.
  assert.deepEqual(state.providers.map((row) => row.id), ['yandex-stt', 'yandex-new', 'openai', 'local-command']);

  const [yandex, generated, connector, local] = state.providers;
  // The explicit name is used as it stands: a working key lives under it.
  assert.deepEqual(yandex, {
    id: 'yandex-stt',
    name: 'Yandex SpeechKit',
    provider: 'yandex',
    local: false,
    enabled: true,
    configured: true,
    apiKeyRef: 'YANDEX_SPEECHKIT_API_KEY',
    connectorRef: null,
    keyPresent: true,
    keySource: 'own',
  });
  // A record that names no key gets one derived from its own id — and stays
  // "not configured", because no value lives under that name yet.
  assert.equal(generated.apiKeyRef, 'STT_KEY_YANDEX_NEW');
  assert.equal(generated.keyPresent, false);
  assert.equal(generated.keySource, null);
  assert.equal(generated.configured, false);
  // A connector record has a name of its own as well, and the connector behind it.
  assert.equal(connector.apiKeyRef, 'STT_KEY_OPENAI');
  assert.deepEqual(connector.connectorRef, 'OPENAI_API_KEY');
  assert.equal(connector.keyPresent, false);
  assert.equal(connector.keySource, null);
  assert.equal(connector.configured, false);
  // The local one: no credential name at all, and it works.
  assert.deepEqual(local, {
    id: 'local-command',
    name: 'Local speech command',
    provider: null,
    local: true,
    enabled: true,
    configured: true,
    apiKeyRef: null,
    connectorRef: null,
    keyPresent: false,
    keySource: null,
  });

  // Presence is asked about exactly the names the records work with: the record's
  // own first, the connector's only when the own name has no value. A local record
  // has no name to ask about, so the store is not touched for it.
  assert.deepEqual(store.calls, [
    { op: 'resolve', ref: 'YANDEX_SPEECHKIT_API_KEY' },
    { op: 'resolve', ref: 'STT_KEY_YANDEX_NEW' },
    { op: 'resolve', ref: 'STT_KEY_OPENAI' },
    { op: 'resolve', ref: 'OPENAI_API_KEY' },
  ]);
});

test('a connector key answers for a record nobody typed a key into — and says so', async () => {
  const store = fakeStore({ OPENAI_API_KEY: 'sk-connector' });
  const state = await stateOf(configuredProviders(), store);
  const connector = state.providers.find((row) => row.id === 'openai');

  assert.equal(connector.keyPresent, true);
  assert.equal(connector.keySource, 'connector');
  assert.equal(connector.apiKeyRef, 'STT_KEY_OPENAI');
  assert.equal(connector.connectorRef, 'OPENAI_API_KEY');
});

test('a key typed into our card wins over the connector\'s', async () => {
  const store = fakeStore({ OPENAI_API_KEY: 'sk-connector', STT_KEY_OPENAI: 'own-key' });
  const state = await stateOf(configuredProviders(), store);
  const connector = state.providers.find((row) => row.id === 'openai');

  assert.equal(connector.keyPresent, true);
  assert.equal(connector.keySource, 'own');
  // The connector name is not even asked about: the own value decided it.
  assert.deepEqual(store.calls.filter((call) => call.ref === 'OPENAI_API_KEY'), []);
});

test('presence reads a non-empty value, and a broken store is not an outage', async () => {
  assert.equal(await refPresent('OPENAI_API_KEY', fakeStore({ OPENAI_API_KEY: 'sk-x' })), true);
  assert.equal(await refPresent('OPENAI_API_KEY', fakeStore({ OPENAI_API_KEY: '   ' })), false);
  assert.equal(await refPresent('OPENAI_API_KEY', fakeStore({})), false);
  // The store may refuse a name or be gone; the card draws a state either way.
  assert.equal(await refPresent('OPENAI_API_KEY', { resolve: async () => { throw new Error('refused'); } }), false);
  assert.equal(await refPresent('OPENAI_API_KEY', null), false);
  assert.equal(await refPresent('', fakeStore({})) , false);
});

test('without a credentials service every remote row says there is no key', async () => {
  const state = await stateOf(configuredProviders(), null);
  assert.deepEqual(state.providers.map((row) => row.keyPresent), [false, false, false, false]);
  assert.deepEqual(state.providers.map((row) => row.keySource), [null, null, null, null]);
  // The local recognizer is not affected by a missing store: it needs no key.
  assert.deepEqual(state.providers.map((row) => row.configured), [false, false, false, true]);
});

test('saving a key writes it and answers only the facts', async () => {
  const store = fakeStore({});
  const logs = [];
  const answer = await post(handlerWith(store, { log: (line) => logs.push(line) }), {
    ref: 'STT_KEY_YANDEX_NEW',
    value: '  secret-value  ',
  });
  assert.equal(answer.status, 200);
  const body = await answer.json();

  assert.deepEqual(body, { ok: true, ref: 'STT_KEY_YANDEX_NEW', present: true });
  // The value is trimmed once, and that is what reaches the store.
  assert.deepEqual(store.calls.find((call) => call.op === 'set'), {
    op: 'set',
    ref: 'STT_KEY_YANDEX_NEW',
    value: 'secret-value',
  });
  // The value is in neither the answer nor the log line.
  const text = JSON.stringify(body);
  assert.equal(text.includes('secret-value'), false);
  assert.equal(logs.join('\n').includes('secret-value'), false);
  assert.match(logs.join('\n'), /credential STT_KEY_YANDEX_NEW: сохранён/u);
});

test('an empty field with a stored key writes nothing and says so', async () => {
  const store = fakeStore({ YANDEX_SPEECHKIT_API_KEY: 'working-key' });
  const logs = [];
  const answer = await post(handlerWith(store, { log: (line) => logs.push(line) }), {
    ref: 'YANDEX_SPEECHKIT_API_KEY',
    value: '',
  });
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), {
    ok: true,
    ref: 'YANDEX_SPEECHKIT_API_KEY',
    present: true,
    unchanged: true,
  });
  // Nothing was written: an empty field means "leave the key alone".
  assert.deepEqual(store.calls.filter((call) => call.op === 'set'), []);
  assert.match(logs.join('\n'), /ключ не изменён/u);
});

test('an empty field with no stored key is refused, with its own code', async () => {
  const store = fakeStore({});
  const answer = await post(handlerWith(store), { ref: 'STT_KEY_YANDEX_NEW', value: '' });
  assert.equal(answer.status, 400);
  const body = await answer.json();
  assert.equal(body.code, 'empty_value');
  assert.equal(store.calls.filter((call) => call.op === 'set').length, 0);
});

test('a name outside the store grammar is refused before it reaches the store', async () => {
  const store = fakeStore({});
  for (const ref of ['lower_case', 'A', 'A-B', 'a'.repeat(70), 42, null]) {
    const answer = await post(handlerWith(store), { ref, value: 'x' });
    assert.equal(answer.status, 400, `ref ${JSON.stringify(ref)} should be refused`);
    assert.equal((await answer.json()).code, 'bad-request');
  }
  assert.deepEqual(store.calls, []);
});

test('a body that is not JSON, and a value that is not a string, are refused', async () => {
  const store = fakeStore({});
  const broken = await post(handlerWith(store), 'not json at all');
  assert.equal(broken.status, 400);

  const wrongValue = await post(handlerWith(store), { ref: 'STT_KEY_YANDEX_NEW', value: 42 });
  assert.equal(wrongValue.status, 400);
  assert.deepEqual(store.calls, []);
});

test('a Host without a credentials service answers 503 instead of pretending', async () => {
  const answer = await post(createHandler(configuredProviders(), { credentials: () => null }), {
    ref: 'STT_KEY_YANDEX_NEW',
    value: 'secret',
  });
  assert.equal(answer.status, 503);
  assert.equal((await answer.json()).code, 'credentials_unavailable');
});

test('a store that refuses the write carries its own sentence to the card', async () => {
  const store = {
    calls: [],
    async resolve() { return undefined; },
    async set() { throw new Error('read-only layer'); },
  };
  const answer = await post(handlerWith(store), { ref: 'STT_KEY_YANDEX_NEW', value: 'secret' });
  assert.equal(answer.status, 503);
  const body = await answer.json();
  assert.equal(body.code, 'credentials_unavailable');
  assert.match(body.error, /read-only layer/u);
  assert.equal(JSON.stringify(body).includes('secret'), false);
});

test('an unknown path is a 404 with the method in the sentence', async () => {
  const answer = await handlerWith(fakeStore())(new Request(`http://localhost${BASE_PATH}/nope`, { method: 'POST' }));
  assert.equal(answer.status, 404);
  const body = await answer.json();
  assert.equal(body.code, 'not-found');
  assert.match(body.error, /POST \/api\/speech-gate\/nope/u);
});

test('a recognizer nobody configured is not registered, and the card says why', async () => {
  const providers = configuredProviders();
  const { gate, store, speechToText } = await gateOver(providers, { YANDEX_SPEECHKIT_API_KEY: 'working-key' });
  const handler = createHandler(providers, { credentials: () => store, gate });

  // Exactly the configured ones are offered to the Host: the keyed SpeechKit
  // record and the local command. The two records without a key are absent, so a
  // person cannot pick something that would fail on the first attempt.
  assert.deepEqual([...speechToText.registered], ['yandex-stt', 'local-command']);

  const state = await (await get(handler)).json();
  const unconfigured = state.providers.filter((row) => row.configured === false);
  assert.deepEqual(unconfigured.map((row) => row.id), ['yandex-new', 'openai']);
  // The card draws these as a grey line with this sentence, and no switch.
  assert.equal(state.providers.every((row) => typeof row.enabled === 'boolean'), true);
});

test('the switch withdraws a registration at once — no restart, no remount', async () => {
  const providers = configuredProviders();
  const { gate, store, speechToText, persisted } = await gateOver(providers, { YANDEX_SPEECHKIT_API_KEY: 'working-key' });
  const handler = createHandler(providers, { credentials: () => store, gate });
  assert.deepEqual([...speechToText.registered], ['yandex-stt', 'local-command']);

  const off = await post(handler, { id: 'yandex-stt', enabled: false }, `${BASE_PATH}/enabled`);
  assert.equal(off.status, 200);
  assert.deepEqual(await off.json(), {
    ok: true, id: 'yandex-stt', enabled: false, registered: false, saved: true,
  });
  // The Host is no longer offered the recognizer, and the card's next read says so.
  assert.deepEqual([...speechToText.registered], ['local-command']);
  assert.equal((await (await get(handler)).json()).providers[0].enabled, false);
  // The answer was written into the profile, so it survives a restart.
  assert.deepEqual(persisted, [{ 'yandex-stt': false }]);

  // Flipping it back returns the registration, again without a restart.
  const on = await post(handler, { id: 'yandex-stt', enabled: true }, `${BASE_PATH}/enabled`);
  assert.deepEqual(await on.json(), { ok: true, id: 'yandex-stt', enabled: true, registered: true, saved: true });
  assert.deepEqual([...speechToText.registered].sort(), ['local-command', 'yandex-stt']);
  assert.deepEqual(persisted.at(-1), { 'yandex-stt': true });
});

test('a disabled record is never registered, whatever its key says', async () => {
  const providers = applyEnabled(configuredProviders(), { 'yandex-stt': false });
  const { gate, store, speechToText } = await gateOver(providers, { YANDEX_SPEECHKIT_API_KEY: 'working-key' });

  assert.deepEqual([...speechToText.registered], ['local-command']);
  assert.equal((await stateOf(providers, store, { configured: (provider) => gate.isConfigured(provider.id) }))
    .providers.find((row) => row.id === 'yandex-stt').enabled, false);
});

test('a saved key makes its recognizer usable without a restart', async () => {
  const providers = configuredProviders();
  const { gate, store, speechToText } = await gateOver(providers, {});
  assert.deepEqual([...speechToText.registered], ['local-command']);

  const handler = createHandler(providers, { credentials: () => store, gate });
  const answer = await post(handler, { ref: 'STT_KEY_YANDEX_NEW', value: 'fresh-key' });
  assert.equal(answer.status, 200);
  // The roster is brought in line right away: the person just made it work.
  assert.deepEqual([...speechToText.registered].sort(), ['local-command', 'yandex-new']);
  const state = await (await get(handler)).json();
  assert.equal(state.providers.find((row) => row.id === 'yandex-new').configured, true);
});

test('the switch refuses an unknown id, a bad body and a Host without a gate', async () => {
  const providers = configuredProviders();
  const { gate, store } = await gateOver(providers, {});
  const handler = createHandler(providers, { credentials: () => store, gate });

  const unknown = await post(handler, { id: 'nope', enabled: false }, `${BASE_PATH}/enabled`);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).code, 'unknown_provider');

  for (const body of [{ id: '', enabled: false }, { id: 'yandex-stt' }, { id: 'yandex-stt', enabled: 'no' }, [], 'junk']) {
    const refused = await post(handler, body, `${BASE_PATH}/enabled`);
    assert.equal(refused.status, 400, `body ${JSON.stringify(body)} should be refused`);
  }

  // A Host that mounted no gate cannot flip anything — and says so instead of
  // pretending the switch worked.
  const noGate = await post(createHandler(providers, { credentials: () => store }),
    { id: 'yandex-stt', enabled: false }, `${BASE_PATH}/enabled`);
  assert.equal(noGate.status, 503);
  assert.equal((await noGate.json()).code, 'gate_unavailable');
});

test('the switch body carries an id and a boolean and nothing else', () => {
  assert.deepEqual(enabledFrom({ id: ' yandex ', enabled: true }), { id: 'yandex', enabled: true });
  assert.throws(() => enabledFrom(null), /JSON-объектом/u);
  assert.throws(() => enabledFrom({ id: 'x' }), /enabled/u);
  assert.throws(() => enabledFrom({ enabled: true }), /id/u);
});

test('the credential body carries a trimmed value and nothing else', () => {
  assert.deepEqual(credentialFrom({ ref: 'STT_KEY_A', value: '  k ' }), { ref: 'STT_KEY_A', value: 'k' });
  assert.deepEqual(credentialFrom({ ref: 'STT_KEY_A' }), { ref: 'STT_KEY_A', value: '' });
  assert.throws(() => credentialFrom(null), /JSON-объектом/u);
  assert.throws(() => credentialFrom([]), /JSON-объектом/u);
  // The grammar is the store's own, narrowed: upper case, three characters at least.
  assert.equal(CREDENTIAL_REF_PATTERN.test('STT_KEY_A'), true);
  assert.equal(CREDENTIAL_REF_PATTERN.test('a_key'), false);
  // Three characters is the floor: a one-letter name is not an environment name.
  assert.equal(CREDENTIAL_REF_PATTERN.test('AB'), false);
});

test('a thrown error maps to the status it carries', () => {
  assert.equal(statusOf({ status: 503 }), 503);
  assert.equal(statusOf({ code: 'speech-gate-http' }), 400);
  assert.equal(statusOf(new Error('boom')), 500);
});

test('the routes mount on the connection the Host gives, and unmount with it', () => {
  const registered = [];
  const disposed = [];
  let disposer = null;
  const ctx = {
    connection: {
      fetch: {
        register(entry) {
          registered.push(entry);
          return () => disposed.push(entry.path);
        },
      },
    },
    effect: (callback) => { disposer = callback(); },
  };
  mountRoutes(ctx, configuredProviders(), { warn: () => {}, log: () => {} });

  assert.deepEqual(registered.map((entry) => [entry.path, entry.methods]), [
    [`${BASE_PATH}/state`, ['GET']],
    [`${BASE_PATH}/credential`, ['POST']],
    [`${BASE_PATH}/enabled`, ['POST']],
  ]);
  assert.ok(registered.every((entry) => typeof entry.fetch === 'function'));

  // Unloading the plugin takes every route with it.
  assert.equal(typeof disposer, 'function');
  disposer();
  assert.deepEqual(disposed.sort(), [`${BASE_PATH}/credential`, `${BASE_PATH}/enabled`, `${BASE_PATH}/state`]);
});

test('a Host without a connection service warns once and stays harmless', () => {
  const warnings = [];
  const dispose = mountRoutes({}, configuredProviders(), { warn: (line) => warnings.push(line) });
  assert.equal(typeof dispose, 'function');
  assert.match(warnings.join('\n'), /останется без сервера/u);
});
