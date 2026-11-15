// The card's own two routes, driven with real Requests and a fake store.
//
// What is worth a test here is not the plumbing but the rules a person would hit:
// which rows are shown, where a key's presence comes from, and the two different
// answers to an empty field. The value of a key is checked to stay out of every
// answer and every log line, because that is the one mistake that cannot be undone.
import assert from 'node:assert/strict'
import test from 'node:test'

import { assignApiKeyRefs, normalizeConfig } from '../index.mjs'
import {
  BASE_PATH,
  CREDENTIAL_REF_PATTERN,
  createHandler,
  credentialFrom,
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
  return assignApiKeyRefs(providers, {}).providers;
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

const post = (handler, body) => handler(new Request(`http://localhost${BASE_PATH}/credential`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}));

test('the state lists the records that take a key, and only those', async () => {
  const store = fakeStore({ YANDEX_SPEECHKIT_API_KEY: 'working-key' });
  const answer = await get(handlerWith(store));
  assert.equal(answer.status, 200);
  const state = await answer.json();

  assert.deepEqual(state.providers.map((row) => row.id), ['yandex-stt', 'yandex-new', 'openai']);
  // A local command takes no key, so it is not a row at all.
  assert.equal(state.providers.some((row) => row.id === 'local-command'), false);

  const [yandex, generated, connector] = state.providers;
  // The explicit name is used as it stands: a working key lives under it.
  assert.deepEqual(yandex, {
    id: 'yandex-stt',
    name: 'Yandex SpeechKit',
    provider: 'yandex',
    apiKeyRef: 'YANDEX_SPEECHKIT_API_KEY',
    connectorRef: null,
    keyPresent: true,
    keySource: 'own',
  });
  // A record that names no key gets one derived from its own id.
  assert.equal(generated.apiKeyRef, 'STT_KEY_YANDEX_NEW');
  assert.equal(generated.keyPresent, false);
  assert.equal(generated.keySource, null);
  // A connector record has a name of its own as well, and the connector behind it.
  assert.equal(connector.apiKeyRef, 'STT_KEY_OPENAI');
  assert.deepEqual(connector.connectorRef, 'OPENAI_API_KEY');
  assert.equal(connector.keyPresent, false);
  assert.equal(connector.keySource, null);

  // Presence is asked about exactly the names the records work with: the record's
  // own first, the connector's only when the own name has no value.
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

test('without a credentials service every row says there is no key', async () => {
  const state = await stateOf(configuredProviders(), null);
  assert.deepEqual(state.providers.map((row) => row.keyPresent), [false, false, false]);
  assert.deepEqual(state.providers.map((row) => row.keySource), [null, null, null]);
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
  ]);
  assert.ok(registered.every((entry) => typeof entry.fetch === 'function'));

  // Unloading the plugin takes both routes with it.
  assert.equal(typeof disposer, 'function');
  disposer();
  assert.deepEqual(disposed.sort(), [`${BASE_PATH}/credential`, `${BASE_PATH}/state`]);
});

test('a Host without a connection service warns once and stays harmless', () => {
  const warnings = [];
  const dispose = mountRoutes({}, configuredProviders(), { warn: (line) => warnings.push(line) });
  assert.equal(typeof dispose, 'function');
  assert.match(warnings.join('\n'), /останется без сервера/u);
});
