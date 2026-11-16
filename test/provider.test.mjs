import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  apply,
  apiKeyRefFor,
  applyEnabled,
  assignApiKeyRefs,
  createProvider,
  createProviderGate,
  isConfigured,
  isLocalEndpoint,
  judgeRecord,
  persistApiKeyRefs,
  persistEnabled,
  normalizeConfig,
  resolveApiKey,
  resolveConfiguredProvider,
  rosterLine,
  runCommand,
  stripOutput,
  transcribeViaApi,
  transcribeViaSpeechKit,
  wavSeconds,
  wavToPcm,
  yandexLanguage,
  YANDEX_STT_ENDPOINT,
} from '../index.mjs';

/** The single provider a flat config produces. */
function one(config) {
  return normalizeConfig(config).providers[0];
}

/** The same provider with the credential name the plugin would give it. */
function keyed(options) {
  return assignApiKeyRefs([options], {}).providers[0];
}

function canonicalWav(seconds = 0.5) {
  const samples = Math.round(16_000 * seconds);
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16_000, 24);
  buffer.writeUInt32LE(32_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  return new Uint8Array(buffer);
}

test('config normalizes both backends and rejects junk', () => {
  const api = one({ backend: 'api', baseUrl: 'http://127.0.0.1:8000/v1/', model: 'whisper-1' });
  assert.equal(api.backend, 'api');
  assert.equal(api.baseUrl, 'http://127.0.0.1:8000/v1');
  assert.equal(api.id, 'openai-compatible');
  assert.deepEqual(api.languages, ['ru', 'en']);

  const exec = one({ backend: 'exec', command: 'whisper-cli', args: ['-f', '{input}', '-l', '{language}'] });
  assert.equal(exec.backend, 'exec');
  assert.equal(exec.id, 'local-command');
  assert.deepEqual(exec.args, ['-f', '{input}', '-l', '{language}']);

  assert.throws(() => normalizeConfig({ backend: 'nope' }), /backend must be/u);
  assert.throws(() => normalizeConfig({ backend: 'exec' }), /command must be/u);
  assert.throws(() => normalizeConfig({ backend: 'api', model: '   ' }), /model must be/u);
});

test('the WAV helper reports the canonical duration only', () => {
  assert.equal(wavSeconds(canonicalWav(0.5)), 0.5);
  assert.equal(wavSeconds(new Uint8Array(10)), null);
});

test('stripOutput drops whisper timestamps and blank lines', () => {
  assert.equal(
    stripOutput('[00:00:00.000 --> 00:00:02.000]  привет\n\n[00:00:02.000 --> 00:00:03.000]  мир\n'),
    'привет мир',
  );
});

test('the API backend posts a multipart WAV and returns text', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, async json() { return { text: '  транскрипт  ' }; } };
  };
  const options = one({ backend: 'api', baseUrl: 'http://127.0.0.1:8000/v1', model: 'whisper-1' });
  const text = await transcribeViaApi({ ...options, __apiKey: 'secret' }, {
    audio: canonicalWav(0.2), language: 'ru',
  }, undefined, { fetchImpl });
  assert.equal(text, 'транскрипт');
  assert.equal(calls[0].url, 'http://127.0.0.1:8000/v1/audio/transcriptions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
  const form = calls[0].options.body;
  assert.equal(form.get('model'), 'whisper-1');
  assert.equal(form.get('language'), 'ru');
  assert.ok(form.get('file'));
});

test('an HTTP failure surfaces the status and a short detail', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, async text() { return 'bad key'; } });
  const options = one({ backend: 'api', model: 'w' });
  await assert.rejects(
    () => transcribeViaApi({ ...options, __apiKey: 'k' }, { audio: canonicalWav(0.1), language: 'ru' }, undefined, { fetchImpl }),
    /speech API HTTP 401: bad key/u,
  );
});

test('the exec backend substitutes the WAV path and strips timestamps', async () => {
  const seen = [];
  const spawnImpl = (command, args, options) => {
    seen.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      child.stdout.emit('data', '[00:00:00.000 --> 00:00:01.000]  привет\n');
      child.stderr.emit('data', '');
      child.emit('close', 0);
    });
    return child;
  };
  const options = one({ backend: 'exec', command: 'whisper-cli', args: ['-f', '{input}', '-l', '{language}'] });
  const text = await runCommand(options, { audio: canonicalWav(0.1), language: 'ru' }, undefined, { spawnImpl });
  assert.equal(text, 'привет');
  assert.equal(seen[0].command, 'whisper-cli');
  assert.match(seen[0].args[1], /audio\.wav$/u);
  assert.equal(seen[0].args[3], 'ru');
});

test('a failing command rejects with its exit code', async () => {
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      child.stderr.emit('data', 'boom');
      child.emit('close', 3);
    });
    return child;
  };
  const options = one({ backend: 'exec', command: 'x' });
  await assert.rejects(
    () => runCommand(options, { audio: canonicalWav(0.1), language: 'ru' }, undefined, { spawnImpl }),
    /exited with code 3: boom/u,
  );
});

test('the plugin registers one provider and disposes it with the effect', async () => {
  const registered = [];
  let disposed = 0;
  const disposers = [];
  const ctx = {
    speechToText: {
      register(provider) {
        registered.push(provider);
        return async () => { disposed += 1; };
      },
    },
    // Same shape as the Host: the callback runs now, its result runs on dispose.
    effect(callback) {
      const disposer = callback();
      disposers.push(disposer);
      return () => disposer?.();
    },
    // The record is only registered because a key is there to use.
    get: (service) => (service === 'credentials'
      ? { async resolve(ref) { return { value: ref === 'STT_KEY_OPENAI_COMPATIBLE' ? 'sk-key' : '' }; } }
      : null),
    logger: { warn: () => {} },
  };
  apply(ctx, { backend: 'api', model: 'whisper-1', languages: ['ru'] });
  // Registration follows a presence check, so it settles asynchronously.
  await settle();
  assert.equal(registered.length, 1);
  assert.equal(registered[0].info.id, 'openai-compatible');
  assert.equal(registered[0].info.languages[0], 'ru');
  assert.equal(typeof registered[0].transcribe, 'function');
  assert.equal(disposed, 0);
  disposers[0]();
  await settle();
  assert.equal(disposed, 1);
});

test('a recognizer with no key is not registered at all', async () => {
  const registered = [];
  const ctx = {
    speechToText: { register(provider) { registered.push(provider.info.id); return async () => {}; } },
    effect: (callback) => { callback(); },
    // The store is mounted and answers about every name — with nothing in it.
    // A store that has *not* mounted is a different answer, and 0.4.1 keeps the
    // record then instead of discarding it (see the mount-order tests below).
    get: (service) => (service === 'credentials' ? { async resolve() { return undefined; } } : null),
    logger: { warn: () => {} },
  };
  // Mistral: the config asks for it, but no key exists in the store, the
  // environment or a file, so registering it would offer the Host a recognizer
  // that fails on its first attempt.
  apply(ctx, { backend: 'configured-model', provider: 'mistral', model: 'voxtral-mini-latest' });
  await settle();
  assert.deepEqual(registered, []);
});

test('a disabled record is not registered even with a working key', async () => {
  const registered = [];
  const ctx = {
    speechToText: { register(provider) { registered.push(provider.info.id); return async () => {}; } },
    effect: (callback) => { callback(); },
    get: (service) => (service === 'credentials' ? { async resolve() { return { value: 'sk-key' }; } } : null),
    logger: { warn: () => {} },
  };
  apply(ctx, { backend: 'api', model: 'whisper-1', id: 'mine', enabled: false });
  await settle();
  assert.deepEqual(registered, []);

  // The same record with the switch on is offered.
  apply(ctx, { backend: 'api', model: 'whisper-1', id: 'mine', enabled: true });
  await settle();
  assert.deepEqual(registered, ['mine']);
});

test('api keys resolve from env, credentials and a file', async () => {
  process.env.DSH_SPEECH_TEST_KEY = 'from-env';
  try {
    assert.equal(
      await resolveApiKey({ apiKeyEnv: 'DSH_SPEECH_TEST_KEY' }, null),
      'from-env',
    );
  } finally {
    delete process.env.DSH_SPEECH_TEST_KEY;
  }
  assert.equal(
    await resolveApiKey({ apiKeyRef: 'REF' }, { get: () => ({ async resolve(ref) { return { value: ref === 'REF' ? 'from-credentials' : '' }; } }) }),
    'from-credentials',
  );
});

test('a providers list registers every configured recognizer — local ones need no key', async () => {
  const ids = [];
  const disposers = [];
  const ctx = {
    speechToText: { register(provider) { ids.push(provider.info.id); return async () => {}; } },
    effect(callback) { const disposer = callback(); disposers.push(disposer); return () => disposer?.(); },
    // Only the cloud record has a key; the two local ones do not need one.
    get: (service) => (service === 'credentials'
      ? { async resolve(ref) { return { value: ref === 'STT_KEY_OPENAI_COMPATIBLE' ? 'sk-key' : '' }; } }
      : null),
    logger: { warn: () => {} },
  };
  apply(ctx, {
    providers: [
      { id: 'openai-compatible', backend: 'api', model: 'gpt-4o-mini-transcribe', name: 'OpenAI' },
      { id: 'whisper-local', backend: 'api', baseUrl: 'http://127.0.0.1:8080/v1', model: 'whisper-1', location: 'host-local' },
      { id: 'whisper-exec', backend: 'exec', command: 'whisper-cli', args: ['-f', '{input}'] },
    ],
  });
  await settle();
  assert.deepEqual(ids, ['openai-compatible', 'whisper-local', 'whisper-exec']);
  assert.throws(() => normalizeConfig({ providers: [] }), /providers must be a non-empty array/u);
  assert.throws(() => normalizeConfig({
    providers: [
      { id: 'same', backend: 'api', model: 'a' },
      { id: 'same', backend: 'exec', command: 'b' },
    ],
  }), /provider ids must be unique/u);
  disposers[0]();
});

test('configured-openai-model names its own key and keeps the connector as fallback', () => {
  const options = one({ backend: 'configured-openai-model', model: 'gpt-4o-transcribe', language: 'ru' });
  assert.equal(options.backend, 'api');
  assert.equal(options.baseUrl, 'https://api.openai.com/v1');
  // The record has a name of its own, generated later from its id; the connector's
  // credential is what answers until a person types something into our card.
  assert.equal(options.apiKeyRef, null);
  assert.equal(options.connectorApiKeyRef, 'OPENAI_API_KEY');
  assert.equal(options.model, 'gpt-4o-transcribe');
  assert.equal(options.apiKeyFile, null);
  // An explicit name is the record's own, and still wins over the connector's.
  const override = one({ backend: 'configured-openai-model', model: 'gpt-4o-transcribe', apiKeyRef: 'MY_KEY' });
  assert.equal(override.apiKeyRef, 'MY_KEY');
  assert.equal(override.connectorApiKeyRef, 'OPENAI_API_KEY');
  assert.throws(() => one({ backend: 'nope' }), /backend must be/u);
});

test('configured-model resolves provider, endpoint and credential', () => {
  const llm = { listProviders: () => [{ id: 'openai', name: 'OpenAI' }, { id: 'mistral', name: 'Mistral' }] };
  const ctx = { get: (service) => (service === 'llm' ? llm : null) };

  const voxtral = one({ backend: 'configured-model', model: 'voxtral-mini-latest' });
  assert.deepEqual(resolveConfiguredProvider(voxtral, ctx),
    { provider: 'mistral', baseUrl: 'https://api.mistral.ai/v1', connectorApiKeyRef: 'MISTRAL_API_KEY' });

  const openai = one({ backend: 'configured-model', model: 'gpt-4o-transcribe' });
  assert.equal(resolveConfiguredProvider(openai, ctx).connectorApiKeyRef, 'OPENAI_API_KEY');

  // An explicit provider wins over the model family.
  const forced = one({ backend: 'configured-model', model: 'voxtral-mini-latest', provider: 'openai' });
  assert.equal(resolveConfiguredProvider(forced, ctx).baseUrl, 'https://api.openai.com/v1');

  // A single configured provider resolves an unknown model family.
  const onlyMistral = { get: (service) => (service === 'llm' ? { listProviders: () => [{ id: 'mistral' }] } : null) };
  const custom = one({ backend: 'configured-model', model: 'some-new-model' });
  assert.equal(resolveConfiguredProvider(custom, onlyMistral).provider, 'mistral');

  // Otherwise the failure names the candidates instead of guessing.
  const ambiguous = one({ backend: 'configured-model', model: 'some-new-model' });
  assert.throws(() => resolveConfiguredProvider(ambiguous, ctx), /cannot tell which provider serves model/u);

  // A provider the Host has not configured is refused, not silently used.
  const missing = one({ backend: 'configured-model', model: 'whisper-large-v3-turbo' });
  assert.throws(() => resolveConfiguredProvider(missing, ctx), /has no model connector configured/u);

  // The alias still accepts the old spelling.
  assert.equal(one({ backend: 'configured-openai-model', model: 'gpt-4o-mini-transcribe' }).provider, 'openai');
});

test('provider yandex is selected by config and owns its key name', async () => {
  const options = one({ backend: 'configured-model', provider: 'yandex', language: 'ru' });
  assert.equal(options.backend, 'api');
  assert.equal(options.provider, 'yandex');
  assert.equal(options.endpoint, YANDEX_STT_ENDPOINT);
  assert.equal(options.baseUrl, null);
  assert.equal(options.model, null);
  // No hard-wired SpeechKit name: the record's own name is generated from its id,
  // so a second recognizer of the same account never shares a secret by accident.
  assert.equal(options.apiKeyRef, null);
  assert.equal(options.connectorApiKeyRef, null);
  assert.equal(keyed(options).apiKeyRef, 'STT_KEY_YANDEX');
  assert.equal(options.id, 'yandex');
  assert.equal(options.displayName, 'Yandex SpeechKit');
  assert.equal(options.location, 'cloud');
  // No model connector to resolve: the endpoint and the credential are fixed.
  assert.equal(options.configured, undefined);

  // A plain api entry names the provider the same way; an explicit key ref wins.
  const plain = one({ provider: 'yandex', apiKeyRef: 'MY_SPEECHKIT_KEY' });
  assert.equal(plain.provider, 'yandex');
  assert.equal(plain.apiKeyRef, 'MY_SPEECHKIT_KEY');

  // The registered provider is the SpeechKit one — registered because a key for
  // it exists, which is what makes SpeechKit usable at all.
  const registered = [];
  const ctx = {
    speechToText: { register(provider) { registered.push(provider); return async () => {}; } },
    // Same shape as the Host: the callback runs now, its result runs on dispose.
    effect(callback) { const disposer = callback(); return () => disposer?.(); },
    get: (service) => (service === 'credentials'
      ? { async resolve(ref) { return { value: ref === 'STT_KEY_YANDEX' ? 'yc-key' : '' }; } }
      : null),
  };
  apply(ctx, { provider: 'yandex', languages: ['ru'] });
  await settle();
  assert.equal(registered.length, 1);
  assert.equal(registered[0].info.id, 'yandex');
  assert.deepEqual(registered[0].info.languages, ['ru']);
});

test('yandex language codes are region-qualified', () => {
  assert.equal(yandexLanguage('ru'), 'ru-RU');
  assert.equal(yandexLanguage('en'), 'en-US');
  assert.equal(yandexLanguage('kk'), 'kk-KZ');
  assert.equal(yandexLanguage('RU'), 'ru-RU');
  assert.equal(yandexLanguage('de-DE'), 'de-DE');
  assert.equal(yandexLanguage('ru-ru'), 'ru-RU');
  // Unknown or missing: the package default, Russian.
  assert.equal(yandexLanguage('zz'), 'ru-RU');
  assert.equal(yandexLanguage(''), 'ru-RU');
  assert.equal(yandexLanguage(undefined), 'ru-RU');
});

test('the PCM payload drops the WAV header and keeps the samples', () => {
  const wav = canonicalWav(0.2);
  const pcm = wavToPcm(wav);
  assert.equal(pcm.length, wav.length - 44);
  assert.deepEqual(Buffer.from(pcm), Buffer.from(wav.subarray(44)));
  assert.equal(Buffer.from(pcm).includes('RIFF'), false);
  // Audio that is not a RIFF container is already raw PCM.
  const raw = new Uint8Array(100).fill(7);
  assert.deepEqual(Buffer.from(wavToPcm(raw)), Buffer.from(raw));
});

test('the yandex backend posts raw PCM to SpeechKit with its own auth header', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async text() { return JSON.stringify({ result: '  привет мир  ' }); } };
  };
  const wav = canonicalWav(0.2);
  const text = await transcribeViaSpeechKit(
    { endpoint: YANDEX_STT_ENDPOINT, __apiKey: 'secret' },
    { audio: wav, language: 'ru' },
    undefined,
    { fetchImpl },
  );
  assert.equal(text, 'привет мир');

  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, YANDEX_STT_ENDPOINT);
  assert.equal(url.searchParams.get('lang'), 'ru-RU');
  assert.equal(url.searchParams.get('format'), 'lpcm');
  assert.equal(url.searchParams.get('sampleRateHertz'), '16000');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Api-Key secret');

  const body = Buffer.from(calls[0].options.body);
  assert.equal(body.length, wav.length - 44);
  assert.equal(body.includes('RIFF'), false);
  assert.deepEqual(body, Buffer.from(wav.subarray(44)));
});

test('a SpeechKit failure surfaces the service code and message', async () => {
  const failing = async () => ({
    ok: false,
    status: 400,
    async text() { return JSON.stringify({ error_code: 'ERR_INVALID_AUDIO', error_message: 'invalid audio' }); },
  });
  await assert.rejects(
    () => transcribeViaSpeechKit({ __apiKey: 'k' }, { audio: canonicalWav(0.1) }, undefined, { fetchImpl: failing }),
    (error) => {
      assert.equal(error.message, 'yandex-stt ERR_INVALID_AUDIO: invalid audio');
      return true;
    },
  );

  // The error body decides even when the status says 200.
  const sneaky = async () => ({
    ok: true,
    status: 200,
    async text() { return JSON.stringify({ error_code: 'ERR_BAD_REQUEST', error_message: 'quota' }); },
  });
  await assert.rejects(
    () => transcribeViaSpeechKit({ __apiKey: 'k' }, { audio: canonicalWav(0.1) }, undefined, { fetchImpl: sneaky }),
    /yandex-stt ERR_BAD_REQUEST: quota/u,
  );

  // A non-JSON failure still carries the status.
  const broken = async () => ({ ok: false, status: 502, async text() { return 'bad gateway'; } });
  await assert.rejects(
    () => transcribeViaSpeechKit({ __apiKey: 'k' }, { audio: canonicalWav(0.1) }, undefined, { fetchImpl: broken }),
    /yandex-stt HTTP 502: bad gateway/u,
  );
});

test('an empty SpeechKit result is an empty transcript, not an error', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, async text() { return JSON.stringify({ result: '' }); } });
  const text = await transcribeViaSpeechKit({ __apiKey: 'k' }, { audio: canonicalWav(0.1) }, undefined, { fetchImpl });
  assert.equal(text, '');
});

test('a yandex provider resolves the shared key and hits SpeechKit', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async text() { return JSON.stringify({ result: 'готово' }); } };
  };
  try {
    // The live profile spells the name out, because the synthesizer already uses
    // that key: an explicit name is respected.
    const options = one({ backend: 'configured-model', provider: 'yandex', language: 'ru', apiKeyRef: 'YANDEX_SPEECHKIT_API_KEY' });
    const ctx = {
      get: (service) => (service === 'credentials'
        ? { async resolve(ref) { return { value: ref === 'YANDEX_SPEECHKIT_API_KEY' ? 'yc-key' : '' }; } }
        : null),
    };
    const provider = createProvider(options, ctx);
    const result = await provider.transcribe({ audio: canonicalWav(0.2), language: 'ru' });
    assert.equal(result.text, 'готово');
    assert.equal(result.audioSeconds, 0.2);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/stt\.api\.cloud\.yandex\.net\/speech\/v1\/stt:recognize\?/u);
    assert.equal(calls[0].options.headers.Authorization, 'Api-Key yc-key');
  } finally {
    globalThis.fetch = original;
  }
});

test('a missing Yandex key names the credential instead of calling out', async () => {
  // The key the message names is the one this record works with — the generated
  // name, not a hard-coded one from some other plugin.
  const provider = createProvider(keyed(one({ provider: 'yandex' })), {
    get: () => ({ async resolve() { return { value: '' }; } }),
  });
  await assert.rejects(
    () => provider.transcribe({ audio: canonicalWav(0.1) }),
    /STT_KEY_YANDEX/u,
  );
});

/* ── credential names: one per record ─────────────────────────────────────── */

/** Let the fire-and-forget profile write in `apply()` settle. */
const settle = async () => {
  for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** A credentials store that answers from a map and records what it was asked. */
function storeOf(values = {}) {
  const store = {
    calls: [],
    async resolve(ref) {
      store.calls.push(ref);
      return Object.hasOwn(values, ref) ? { value: values[ref] } : undefined;
    },
    async set(ref, value) {
      store.calls.push(`set:${ref}`);
      values[ref] = value;
    },
  };
  return store;
}

test('a credential name is derived from the record id', () => {
  assert.equal(apiKeyRefFor('yandex-stt'), 'STT_KEY_YANDEX_STT');
  assert.equal(apiKeyRefFor('OpenAI gpt-4o'), 'STT_KEY_OPENAI_GPT_4O');
  assert.equal(apiKeyRefFor(''), '');
  // The store's own limit: a long id is cut, not refused.
  assert.equal([...apiKeyRefFor('x'.repeat(90))].length, 64);
});

test('every remote API record gets a name of its own, and a local one gets none', () => {
  const { providers, added } = assignApiKeyRefs(normalizeConfig({
    providers: [
      // Explicit: a working key already lives under this name.
      { id: 'yandex-stt', provider: 'yandex', apiKeyRef: 'YANDEX_SPEECHKIT_API_KEY' },
      { id: 'yandex-new', provider: 'yandex' },
      // A connector record has its own name too, with the connector as fallback.
      { id: 'openai-transcribe', backend: 'configured-model', model: 'gpt-4o-transcribe' },
      { id: 'whisper-local', backend: 'api', baseUrl: 'http://127.0.0.1:8080/v1', model: 'whisper-1' },
      { id: 'whisper-exec', backend: 'exec', command: 'whisper-cli' },
    ],
  }).providers, {});

  assert.deepEqual(providers.map((provider) => provider.apiKeyRef), [
    'YANDEX_SPEECHKIT_API_KEY',
    'STT_KEY_YANDEX_NEW',
    'STT_KEY_OPENAI_TRANSCRIBE',
    // A whisper server on this machine takes no key, so it gets no name: a name
    // nobody fills in is what made the card show a field for a key that is not
    // needed — and made `STT_KEY_WHISPER_LOCAL` appear in the profile.
    null,
    null,
  ]);
  assert.deepEqual(providers.map((provider) => provider.local), [false, false, false, true, true]);
  // Only the generated ones are news for the profile; the explicit one is not ours
  // to rewrite.
  assert.deepEqual(added, {
    'yandex-new': 'STT_KEY_YANDEX_NEW',
    'openai-transcribe': 'STT_KEY_OPENAI_TRANSCRIBE',
  });
  // The connector name stays where it belongs: on the record, as a fallback.
  assert.equal(providers[2].connectorApiKeyRef, 'OPENAI_API_KEY');
});

test('a remembered name is kept, and two ids that flatten alike do not collide', () => {
  const { providers, added } = assignApiKeyRefs(normalizeConfig({
    providers: [
      { id: 'yandex-stt', provider: 'yandex' },
      { id: 'yandex.stt', provider: 'yandex' },
    ],
  }).providers, { 'yandex-stt': 'STT_KEY_REMEMBERED' });

  // A name written into the profile earlier is used as it stands...
  assert.equal(providers[0].apiKeyRef, 'STT_KEY_REMEMBERED');
  // ...and a second record that would flatten to the same name gets its own.
  assert.equal(providers[1].apiKeyRef, 'STT_KEY_YANDEX_STT');
  assert.deepEqual(added, { 'yandex.stt': 'STT_KEY_YANDEX_STT' });
});

test('the generated names are written into the profile once', async () => {
  const updates = [];
  const ctx = {
    get: (service) => (service === 'settings'
      ? { async update(entryId, patch) { updates.push({ entryId, patch }); } }
      : null),
    fiber: { entry: { options: { id: 'dsh-speech-gate' } } },
  };

  assert.equal(await persistApiKeyRefs(ctx, { 'yandex-new': 'STT_KEY_YANDEX_NEW' }), true);
  assert.deepEqual(updates, [{
    entryId: 'dsh-speech-gate',
    patch: { apiKeyRefs: { 'yandex-new': 'STT_KEY_YANDEX_NEW' } },
  }]);

  // Without the settings service or a profile entry the names cannot be kept.
  assert.equal(await persistApiKeyRefs({ get: () => null, fiber: { entry: { options: { id: 'x' } } } }, {}), false);
  assert.equal(await persistApiKeyRefs({ get: () => ({ update: async () => {} }) }, {}), false);
});

test('applying a config persists the generated names and keeps given ones', async () => {
  const updates = [];
  const ctx = {
    get: (service) => (service === 'settings'
      ? { async update(entryId, patch) { updates.push(patch); } }
      : null),
    fiber: { entry: { options: { id: 'dsh-speech-gate' } } },
    speechToText: { register() { return () => {}; } },
    effect: (callback) => { callback(); },
    logger: { warn: () => {}, info: () => {} },
  };

  apply(ctx, {
    providers: [
      { id: 'yandex-stt', provider: 'yandex', apiKeyRef: 'YANDEX_SPEECHKIT_API_KEY' },
      { id: 'openai', backend: 'configured-model', model: 'whisper-1' },
    ],
  });
  await settle();
  assert.deepEqual(updates, [{ apiKeyRefs: { openai: 'STT_KEY_OPENAI' } }]);

  // A profile that already carries the names is not written again.
  updates.length = 0;
  apply(ctx, {
    apiKeyRefs: { yandex: 'STT_KEY_YANDEX' },
    providers: [{ id: 'yandex', provider: 'yandex' }],
  });
  await settle();
  assert.deepEqual(updates, []);
});

test('a key resolves in order: own name, connector, env, file', async () => {
  const store = storeOf({ OWN: 'from-own', CONNECTOR: 'from-connector' });
  const ctx = { get: (service) => (service === 'credentials' ? store : null) };

  assert.equal(await resolveApiKey({ apiKeyRef: 'OWN', connectorApiKeyRef: 'CONNECTOR' }, ctx), 'from-own');
  assert.equal(await resolveApiKey({ apiKeyRef: 'MISSING', connectorApiKeyRef: 'CONNECTOR' }, ctx), 'from-connector');

  process.env.DSH_SPEECH_ORDER_KEY = 'from-env';
  try {
    // The env fallback answers only when neither credential name holds a value.
    assert.equal(await resolveApiKey({ apiKeyRef: 'MISSING', apiKeyEnv: 'DSH_SPEECH_ORDER_KEY' }, ctx), 'from-env');
    assert.equal(
      await resolveApiKey({ apiKeyRef: 'OWN', apiKeyEnv: 'DSH_SPEECH_ORDER_KEY' }, ctx),
      'from-own',
      'a value in our own card wins over the environment',
    );
  } finally {
    delete process.env.DSH_SPEECH_ORDER_KEY;
  }
});

test('a connector record transcribes on the connector key until one is typed', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async json() { return { text: 'готово' }; } };
  };
  try {
    const options = keyed(one({ backend: 'configured-model', provider: 'openai', model: 'gpt-4o-transcribe' }));
    assert.equal(options.apiKeyRef, 'STT_KEY_OPENAI_COMPATIBLE');
    const ctx = {
      get: (service) => {
        if (service === 'llm') return { listProviders: () => [{ id: 'openai' }] };
        if (service === 'credentials') {
          return { async resolve(ref) { return { value: ref === 'OPENAI_API_KEY' ? 'sk-connector' : '' }; } };
        }
        return null;
      },
    };
    // Nothing typed into our card: the model settings answer, exactly as before.
    const provider = createProvider(options, ctx);
    assert.equal((await provider.transcribe({ audio: canonicalWav(0.1) })).text, 'готово');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-connector');

    // A key typed into our card wins, because the record's own name is asked first.
    const ownCtx = {
      get: (service) => {
        if (service === 'llm') return { listProviders: () => [{ id: 'openai' }] };
        if (service === 'credentials') {
          return {
            async resolve(ref) {
              if (ref === 'STT_KEY_OPENAI_COMPATIBLE') return { value: 'own-key' };
              if (ref === 'OPENAI_API_KEY') return { value: 'sk-connector' };
              return undefined;
            },
          };
        }
        return null;
      },
    };
    await createProvider(options, ownCtx).transcribe({ audio: canonicalWav(0.1) });
    assert.equal(calls[1].options.headers.Authorization, 'Bearer own-key');
  } finally {
    globalThis.fetch = original;
  }
});

test('a local endpoint with no key transcribes without an Authorization header', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async json() { return { text: 'локально' }; } };
  };
  try {
    // A local record never gets a name and never needs a key: nothing about it is
    // a requirement, and the card draws no key field for it at all.
    const options = keyed(one({ backend: 'api', baseUrl: 'http://127.0.0.1:8080/v1', model: 'whisper-1', location: 'host-local' }));
    assert.equal(options.apiKeyRef, null);
    assert.equal(options.local, true);
    assert.equal(options.location, 'host-local');
    assert.equal(options.keyRequired, false);
    const ctx = { get: (service) => (service === 'credentials' ? storeOf({}) : null) };

    const result = await createProvider(options, ctx).transcribe({ audio: canonicalWav(0.1) });
    assert.equal(result.text, 'локально');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

/* ── local records, the switch and the live roster ─────────────────────────── */

test('a loopback endpoint is recognised, a remote one is not', () => {
  assert.equal(isLocalEndpoint('http://127.0.0.1:8080/v1'), true);
  assert.equal(isLocalEndpoint('http://localhost:8080/v1'), true);
  assert.equal(isLocalEndpoint('https://LOCALHOST/v1'), true);
  assert.equal(isLocalEndpoint('http://[::1]:8080/v1'), true);
  // The endpoint may come without a scheme, as a bare host:port.
  assert.equal(isLocalEndpoint('127.0.0.1:8080'), true);
  assert.equal(isLocalEndpoint('https://api.openai.com/v1'), false);
  assert.equal(isLocalEndpoint('http://192.168.1.5:8080/v1'), false);
  assert.equal(isLocalEndpoint(''), false);
  assert.equal(isLocalEndpoint(undefined), false);
  assert.equal(isLocalEndpoint('not a url at all ::'), false);
});

test('a local recognizer is configured without any key; a remote one is not', async () => {
  const empty = { get: () => null };
  // The command backend and a loopback API record work on their own.
  assert.equal(await isConfigured(one({ backend: 'exec', command: 'whisper-cli' }), empty), true);
  assert.equal(await isConfigured(one({ backend: 'api', baseUrl: 'http://127.0.0.1:8080/v1' }), empty), true);
  // A cloud record while no credentials service is mounted is *not known to be
  // unconfigured*: the service registers itself only after it has read its
  // document, so "nobody asked yet" must not throw the record away. Changed in
  // 0.4.1 on purpose — 0.4.0 answered `false` here and lost every cloud
  // recognizer from the picker at startup.
  assert.equal(await isConfigured(one({ backend: 'api', model: 'whisper-1' }), empty), true);
  // The refusal is a store that is there and has nothing under the name.
  const emptyStore = { get: (service) => (service === 'credentials' ? storeOf({}) : null) };
  assert.equal(await isConfigured(one({ backend: 'api', model: 'whisper-1' }), emptyStore), false);

  // A key makes a remote record usable; the connector's key counts as one.
  const store = storeOf({ STT_KEY_MINE: 'sk-own', OPENAI_API_KEY: 'sk-connector' });
  const ctx = { get: (service) => (service === 'credentials' ? store : null) };
  assert.equal(await isConfigured(one({ backend: 'api', model: 'whisper-1', id: 'mine' }), ctx), true);
  assert.equal(await isConfigured(one({ backend: 'configured-model', provider: 'openai', model: 'gpt-4o-transcribe' }), ctx), true);
  // An environment key counts too: it is a key the recognizer will use.
  process.env.DSH_SPEECH_LOCAL_TEST = 'from-env';
  try {
    assert.equal(await isConfigured(one({ backend: 'api', model: 'w', id: 'other', apiKeyEnv: 'DSH_SPEECH_LOCAL_TEST' }), empty), true);
  } finally {
    delete process.env.DSH_SPEECH_LOCAL_TEST;
  }
});

test('a configured-model record is offered only when its connector is in the Host', async () => {
  const ctxWith = (ids, values = { STT_KEY_CLOUD: 'sk-own', STT_KEY_WHISPER: 'sk-own', STT_KEY_PLAIN: 'sk-own' }) => ({
    get: (service) => {
      if (service === 'llm') return { listProviders: () => ids.map((id) => ({ id })) };
      if (service === 'credentials') return storeOf(values);
      return null;
    },
  });
  const record = keyed(one({ id: 'cloud', backend: 'configured-model', provider: 'openai', model: 'gpt-4o-transcribe' }));

  // A key is there, but the connector the endpoint and the key come from is not:
  // the first call would fail with "no model connector configured", so the record
  // is skipped with a reason of its own instead of reaching the picker.
  assert.deepEqual(await judgeRecord(record, ctxWith(['mistral']), {}),
    { configured: false, reason: 'no-connector' });
  assert.deepEqual(await judgeRecord(record, ctxWith([]), {}),
    { configured: false, reason: 'no-connector' });
  assert.deepEqual(await judgeRecord(record, ctxWith(['openai']), {}),
    { configured: true, reason: 'key-present' });

  // A Host that answers nothing — no `llm` service at all — leaves the question
  // open, and an open question is not a "no": the record stays (it has no store
  // either here, which is the other open question of its own).
  assert.deepEqual(await judgeRecord(record, { get: () => null }, {}),
    { configured: true, reason: 'credentials-service-missing' });
  // An `llm` service that throws answered nothing either.
  const broken = { get: (service) => (service === 'llm'
    ? { listProviders() { throw new Error('not ready'); } }
    : storeOf({ STT_KEY_CLOUD: 'sk-own' })) };
  assert.deepEqual(await judgeRecord(record, broken, {}), { configured: true, reason: 'key-present' });

  // The named service comes from the model family as well: `whisper-1` is openai.
  const whisper = keyed(one({ id: 'whisper', backend: 'configured-model', model: 'whisper-1' }));
  assert.equal(whisper.provider, 'openai');
  assert.deepEqual(await judgeRecord(whisper, ctxWith(['mistral']), {}),
    { configured: false, reason: 'no-connector' });

  // A plain API record has no connector behind it: its own key is all it needs,
  // whatever the model settings say.
  const plain = keyed(one({ id: 'plain', backend: 'api', model: 'whisper-1' }));
  assert.deepEqual(await judgeRecord(plain, ctxWith([]), {}), { configured: true, reason: 'key-present' });
});

test('a record whose connector is missing never reaches the gate\'s roster', async () => {
  const speechToText = liveRegistry();
  const store = storeOf({ STT_KEY_CLOUD: 'sk-own', STT_KEY_PLAIN: 'sk-own' });
  let connectors = ['mistral'];
  const ctx = {
    speechToText,
    get: (service) => (service === 'llm' ? { listProviders: () => connectors.map((id) => ({ id })) } : null),
  };
  const gate = createProviderGate(ctx, { credentials: () => store, persist: async () => true });
  const providers = assignApiKeyRefs(normalizeConfig({
    providers: [
      { id: 'cloud', backend: 'configured-model', provider: 'openai', model: 'gpt-4o-transcribe' },
      { id: 'plain', backend: 'api', model: 'whisper-1' },
    ],
  }).providers, {}).providers;

  await gate.load(providers, {});
  assert.deepEqual([...speechToText.registered], ['plain']);
  assert.deepEqual(gate.report().find((row) => row.id === 'cloud'),
    { id: 'cloud', enabled: true, local: false, reason: 'no-connector', registered: false });
  assert.equal(await gate.isConfigured('cloud'), false);

  // The connector appears in the Host: no restart, the record is settled again.
  connectors = ['mistral', 'openai'];
  await gate.refreshAll();
  assert.deepEqual([...speechToText.registered].sort(), ['cloud', 'plain']);
});

/** A registry that counts registrations: a second one overwrites the first disposer. */
function countingRegistry() {
  const counts = new Map();
  const live = new Set();
  return {
    counts,
    live,
    register(provider) {
      const id = provider.info.id;
      const token = `${id}#${(counts.get(id) ?? 0) + 1}`;
      counts.set(id, counts.get(id) === undefined ? 1 : counts.get(id) + 1);
      live.add(token);
      return async () => { live.delete(token); };
    },
  };
}

test('two refreshes at once register a record once and keep its disposer', async () => {
  const speechToText = countingRegistry();
  const values = {};
  const gate = createProviderGate({ speechToText }, {
    credentials: () => storeOf(values),
    persist: async () => true,
  });
  await gate.load(assignApiKeyRefs(normalizeConfig({
    providers: [{ id: 'cloud', backend: 'api', model: 'whisper-1' }],
  }).providers, {}).providers, {});
  assert.equal(speechToText.live.size, 0);

  // The pair a live Host produces: a key just saved and the roster re-check. Both
  // see the record unregistered before either has written it down.
  values.STT_KEY_CLOUD = 'sk-fresh';
  await Promise.all([gate.refreshAll(), gate.refreshAll()]);
  assert.equal(speechToText.counts.get('cloud'), 1, 'the record was registered twice');
  assert.equal(speechToText.live.size, 1);

  // The kept disposer is the live one: disposing the gate leaves nothing behind.
  await gate.dispose();
  assert.equal(speechToText.live.size, 0, 'a registration lost its disposer');
});

test('the switch stored in the profile wins over the record default', () => {
  const providers = normalizeConfig({
    providers: [
      { id: 'on', backend: 'api', model: 'w' },
      { id: 'declared-off', backend: 'api', model: 'w', enabled: false },
      { id: 'flipped-on', backend: 'exec', command: 'x', enabled: false },
    ],
  }).providers;

  const resolved = applyEnabled(providers, { 'declared-off': true, 'flipped-on': true });
  assert.deepEqual(resolved.map((provider) => provider.enabled), [true, true, true]);
  // Nothing changed: the same objects come back, so a re-read costs nothing.
  assert.equal(applyEnabled(providers, {})[0], providers[0]);
  assert.equal(applyEnabled(providers, null)[1].enabled, false);
});

test('the switch is written into the profile as its own volatile map', async () => {
  const updates = [];
  const ctx = {
    get: (service) => (service === 'settings'
      ? { async update(entryId, patch) { updates.push({ entryId, patch }); } }
      : null),
    fiber: { entry: { options: { id: 'dsh-speech-gate' } } },
  };
  assert.equal(await persistEnabled(ctx, { 'yandex-stt': false }), true);
  assert.deepEqual(updates, [{
    entryId: 'dsh-speech-gate',
    patch: { enabledById: { 'yandex-stt': false } },
  }]);
  // No settings service, no profile entry — nothing to write into.
  assert.equal(await persistEnabled({ get: () => null, fiber: { entry: { options: { id: 'x' } } } }, {}), false);
});

/** A `speechToText` registry that keeps what is registered right now. */
function liveRegistry() {
  const registered = new Set();
  return {
    registered,
    register(provider) {
      if (registered.has(provider.info.id)) throw new Error(`Speech provider already registered: ${provider.info.id}`);
      registered.add(provider.info.id);
      return async () => { registered.delete(provider.info.id); };
    },
  };
}

test('the gate registers the configured records and nothing else', async () => {
  const speechToText = liveRegistry();
  const store = storeOf({ STT_KEY_CLOUD: 'sk-key' });
  const gate = createProviderGate({ speechToText }, {
    credentials: () => store,
    persist: async () => true,
  });
  const providers = normalizeConfig({
    providers: [
      { id: 'cloud', backend: 'api', model: 'whisper-1' },
      { id: 'keyless', backend: 'configured-model', provider: 'mistral', model: 'voxtral-mini-latest' },
      { id: 'local', backend: 'api', baseUrl: 'http://127.0.0.1:8080/v1' },
      { id: 'command', backend: 'exec', command: 'whisper-cli' },
      { id: 'off', backend: 'api', model: 'whisper-1', enabled: false },
    ],
  }).providers;

  await gate.load(assignApiKeyRefs(providers, {}).providers, {});
  // A disabled record is left out even though its key is there.
  assert.deepEqual([...speechToText.registered].sort(), ['cloud', 'command', 'local']);
  assert.equal(gate.isRegistered('keyless'), false);
  assert.equal(await gate.isConfigured('keyless'), false);
});

test('flipping the switch registers and withdraws without a restart', async () => {
  const speechToText = liveRegistry();
  const writes = [];
  const store = storeOf({ STT_KEY_CLOUD: 'sk-key' });
  const gate = createProviderGate({ speechToText }, {
    credentials: () => store,
    persist: async (map) => { writes.push({ ...map }); return true; },
  });
  await gate.load(assignApiKeyRefs(normalizeConfig({
    providers: [
      { id: 'cloud', backend: 'api', model: 'whisper-1' },
      { id: 'command', backend: 'exec', command: 'whisper-cli' },
    ],
  }).providers, {}).providers, {});
  assert.deepEqual([...speechToText.registered].sort(), ['cloud', 'command']);

  // Off: the Host stops being offered the recognizer, here and now.
  assert.deepEqual(await gate.setEnabled('cloud', false),
    { enabled: false, outcome: 'unregistered', registered: false, reason: 'disabled', saved: true });
  assert.deepEqual([...speechToText.registered], ['command']);
  assert.deepEqual(writes, [{ cloud: false }]);

  // On again: the registration comes back, and the profile keeps the answer.
  assert.deepEqual(await gate.setEnabled('cloud', true),
    { enabled: true, outcome: 'registered', registered: true, reason: 'key-present', saved: true });
  assert.deepEqual([...speechToText.registered].sort(), ['cloud', 'command']);
  assert.deepEqual(writes.at(-1), { cloud: true });

  // An unknown id and a non-boolean are refused, not guessed.
  assert.equal(await gate.setEnabled('nope', false), null);
  assert.equal(await gate.setEnabled('cloud', 'yes'), null);
});

test('a switch that cannot reach the profile still works, and says so', async () => {
  const speechToText = liveRegistry();
  const warnings = [];
  const gate = createProviderGate({ speechToText }, {
    warn: (line) => warnings.push(line),
    credentials: () => storeOf({ STT_KEY_CLOUD: 'sk-key' }),
    persist: async () => false,
  });
  await gate.load(assignApiKeyRefs(normalizeConfig({
    providers: [{ id: 'cloud', backend: 'api', model: 'whisper-1' }],
  }).providers, {}).providers, {});

  const outcome = await gate.setEnabled('cloud', false);
  assert.equal(outcome.registered, false);
  assert.equal(outcome.saved, false);
  // The live effect still happened, and the operator is told it will not survive
  // a restart instead of being told it worked.
  assert.deepEqual([...speechToText.registered], []);
  assert.match(warnings.join('\n'), /не легло в профиль/u);
});

test('a key saved later brings a record into the roster', async () => {
  const speechToText = liveRegistry();
  const values = {};
  const gate = createProviderGate({ speechToText }, {
    credentials: () => storeOf(values),
    persist: async () => true,
  });
  await gate.load(assignApiKeyRefs(normalizeConfig({
    providers: [{ id: 'cloud', backend: 'api', model: 'whisper-1' }],
  }).providers, {}).providers, {});
  assert.deepEqual([...speechToText.registered], []);

  await gate.refreshAll();
  assert.deepEqual([...speechToText.registered], []);

  values.STT_KEY_CLOUD = 'sk-fresh';
  await gate.refreshAll();
  assert.deepEqual([...speechToText.registered], ['cloud']);
});

test('disposing the gate withdraws every registration it made', async () => {
  const speechToText = liveRegistry();
  const gate = createProviderGate({ speechToText }, { credentials: () => storeOf({}), persist: async () => true });
  await gate.load(normalizeConfig({
    providers: [
      { id: 'command', backend: 'exec', command: 'whisper-cli' },
      { id: 'local', backend: 'api', baseUrl: 'http://localhost:8080/v1' },
    ],
  }).providers, {});
  assert.deepEqual([...speechToText.registered].sort(), ['command', 'local']);

  await gate.dispose();
  assert.deepEqual([...speechToText.registered], []);
});

/* ── the credentials service mounts after us ──────────────────────────────── */

test('a mount before the credentials service keeps the cloud records', async () => {
  const speechToText = liveRegistry();
  // The Host at mount time: `credentials` is not registered yet, so nobody can
  // say whether a key exists. That is not a "no key".
  const gate = createProviderGate({ speechToText }, { credentials: () => null, persist: async () => true });
  await gate.load(assignApiKeyRefs(normalizeConfig({
    providers: [
      { id: 'cloud', backend: 'api', model: 'whisper-1' },
      { id: 'yandex', provider: 'yandex' },
      { id: 'local', backend: 'api', baseUrl: 'http://127.0.0.1:8080/v1' },
      { id: 'command', backend: 'exec', command: 'whisper-cli' },
    ],
  }).providers, {}).providers, {});

  assert.deepEqual([...speechToText.registered].sort(), ['cloud', 'command', 'local', 'yandex']);
  const rows = gate.report();
  assert.deepEqual(rows.map((row) => [row.id, row.local, row.reason, row.registered]), [
    ['cloud', false, 'credentials-service-missing', true],
    ['yandex', false, 'credentials-service-missing', true],
    ['local', true, 'local', true],
    ['command', true, 'local', true],
  ]);
  // "Has everything it needs" is not a lie either: nothing said it has not.
  assert.equal(await gate.isConfigured('cloud'), true);
});

test('when the store arrives, a record without a key really is withdrawn', async () => {
  const speechToText = liveRegistry();
  let store = null;
  const gate = createProviderGate({ speechToText }, { credentials: () => store, persist: async () => true });
  await gate.load(assignApiKeyRefs(normalizeConfig({
    providers: [
      { id: 'cloud', backend: 'api', model: 'whisper-1' },
      { id: 'command', backend: 'exec', command: 'whisper-cli' },
    ],
  }).providers, {}).providers, {});
  assert.deepEqual([...speechToText.registered].sort(), ['cloud', 'command']);

  // The service comes up, and there is no key under the record's own name.
  store = storeOf({});
  await gate.refreshAll();
  assert.deepEqual([...speechToText.registered], ['command']);
  assert.deepEqual(
    gate.report().find((row) => row.id === 'cloud'),
    { id: 'cloud', enabled: true, local: false, reason: 'no-key', registered: false },
  );
  assert.equal(await gate.isConfigured('cloud'), false);

  // A key saved later brings it back without a restart.
  store = storeOf({ STT_KEY_CLOUD: 'sk-later' });
  await gate.refreshAll();
  assert.deepEqual([...speechToText.registered].sort(), ['cloud', 'command']);
  assert.equal(gate.report().find((row) => row.id === 'cloud').reason, 'key-present');
});

test('a disabled record is never registered, store or no store', async () => {
  for (const credentials of [() => null, () => storeOf({ STT_KEY_OFF: 'sk-unused' })]) {
    const speechToText = liveRegistry();
    const gate = createProviderGate({ speechToText }, { credentials, persist: async () => true });
    await gate.load(assignApiKeyRefs(normalizeConfig({
      providers: [{ id: 'off', backend: 'api', model: 'whisper-1', enabled: false }],
    }).providers, {}).providers, {});
    assert.deepEqual([...speechToText.registered], []);
    // The person's switch is the reason, not a missing key.
    assert.deepEqual(
      gate.report().map((row) => [row.id, row.enabled, row.reason]),
      [['off', false, 'disabled']],
    );
  }
});

test('the diagnostic line names every record with its reason', () => {
  assert.equal(rosterLine([]), 'распознаватели: в конфиге нет ни одной записи');
  assert.equal(
    rosterLine([
      { id: 'yandex', enabled: true, local: false, reason: 'credentials-service-missing', registered: true },
      { id: 'off', enabled: false, local: true, reason: 'disabled', registered: false },
    ]),
    'распознаватели: yandex(enabled=true, local=false, registered=true) → credentials-service-missing; '
      + 'off(enabled=false, local=true, registered=false) → disabled',
  );
});

test('apply re-asks the roster once the credentials service is there', async () => {
  const registered = new Set();
  const lines = [];
  const injects = [];
  let store = null;
  const ctx = {
    // The Host at mount time: neither credentials nor settings is registered.
    get: (service) => (service === 'credentials' ? store : null),
    inject: (services, callback) => { injects.push({ services, callback }); return () => {}; },
    speechToText: {
      register(provider) {
        registered.add(provider.info.id);
        return async () => { registered.delete(provider.info.id); };
      },
    },
    effect: (callback) => { callback(); },
    logger: { warn: () => {}, info: (message) => lines.push(message) },
  };

  apply(ctx, {
    providers: [
      { id: 'yandex', provider: 'yandex' },
      { id: 'command', backend: 'exec', command: 'whisper-cli' },
    ],
  });
  await settle();
  assert.deepEqual([...registered].sort(), ['command', 'yandex']);
  assert.match(lines.at(-1), /yandex\(enabled=true, local=false, registered=true\) → credentials-service-missing/u);

  const waiting = injects.find((entry) => entry.services.includes('credentials'));
  assert.ok(waiting, 'the plugin waits for the credentials service instead of polling forever');

  // The service comes up and has no key: the guess is corrected, and the log says
  // why the recognizer left the picker.
  store = storeOf({});
  waiting.callback();
  await settle();
  assert.deepEqual([...registered], ['command']);
  assert.match(lines.at(-1), /yandex\(enabled=true, local=false, registered=false\) → no-key/u);
});

test('an unasked store is not a "no key", and a switch outranks both', async () => {
  const cloud = keyed(one({ id: 'cloud', backend: 'api', model: 'whisper-1' }));
  // Nobody could be asked: the credentials service has not mounted.
  assert.deepEqual(await judgeRecord(cloud, {}, { credentials: null }),
    { configured: true, reason: 'credentials-service-missing' });
  // A store that answers "no value under this name" is a real refusal.
  assert.deepEqual(await judgeRecord(cloud, {}, { credentials: storeOf({}) }),
    { configured: false, reason: 'no-key' });
  assert.deepEqual(await judgeRecord(cloud, {}, { credentials: storeOf({ STT_KEY_CLOUD: 'sk' }) }),
    { configured: true, reason: 'key-present' });
  // A store that throws answered nothing: the question stays open.
  const broken = { async resolve() { throw new Error('document not read yet'); } };
  assert.deepEqual(await judgeRecord(cloud, {}, { credentials: broken }),
    { configured: true, reason: 'key-unknown' });
  // A local record needs no store; a switched-off one is never registered, even
  // when the key is there and waiting.
  assert.deepEqual(await judgeRecord(keyed(one({ backend: 'exec', command: 'whisper-cli' })), {}, { credentials: null }),
    { configured: true, reason: 'local' });
  assert.deepEqual(
    await judgeRecord(keyed(one({ id: 'off', backend: 'api', model: 'whisper-1', enabled: false })), {}, { credentials: null }),
    { configured: false, reason: 'disabled' },
  );
});
