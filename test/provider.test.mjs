import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  apply,
  apiKeyRefFor,
  assignApiKeyRefs,
  createProvider,
  keyPresence,
  persistApiKeyRefs,
  resolveConfiguredProvider,
  normalizeConfig,
  resolveApiKey,
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

test('the plugin registers one provider and disposes it with the effect', () => {
  const registered = [];
  let disposed = 0;
  const disposers = [];
  const ctx = {
    speechToText: {
      register(provider) {
        registered.push(provider);
        return () => { disposed += 1; };
      },
    },
    // Same shape as the Host: the callback runs now, its result runs on dispose.
    effect(callback) {
      const disposer = callback();
      disposers.push(disposer);
      return () => disposer?.();
    },
    logger: { warn: () => {} },
  };
  apply(ctx, { backend: 'api', model: 'whisper-1', languages: ['ru'] });
  assert.equal(registered.length, 1);
  assert.equal(registered[0].info.id, 'openai-compatible');
  assert.equal(registered[0].info.languages[0], 'ru');
  assert.equal(typeof registered[0].transcribe, 'function');
  assert.equal(disposed, 0);
  disposers[0]();
  assert.equal(disposed, 1);
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

test('a providers list registers every configured recognizer', () => {
  const ids = [];
  const disposers = [];
  const ctx = {
    speechToText: { register(provider) { ids.push(provider.info.id); return () => {}; } },
    effect(callback) { const disposer = callback(); disposers.push(disposer); return () => disposer?.(); },
    logger: { warn: () => {} },
  };
  apply(ctx, {
    providers: [
      { id: 'openai-compatible', backend: 'api', model: 'gpt-4o-mini-transcribe', name: 'OpenAI' },
      { id: 'whisper-local', backend: 'api', baseUrl: 'http://127.0.0.1:8080/v1', model: 'whisper-1', location: 'host-local' },
      { id: 'whisper-exec', backend: 'exec', command: 'whisper-cli', args: ['-f', '{input}'] },
    ],
  });
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

test('provider yandex is selected by config and owns its key name', () => {
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

  // The registered provider is the SpeechKit one.
  const registered = [];
  const ctx = {
    speechToText: { register(provider) { registered.push(provider); return () => {}; } },
    // Same shape as the Host: the callback runs now, its result runs on dispose.
    effect(callback) { const disposer = callback(); return () => disposer?.(); },
  };
  apply(ctx, { provider: 'yandex', languages: ['ru'] });
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

test('every API record gets a name of its own, and a local command gets none', () => {
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
    'STT_KEY_WHISPER_LOCAL',
    // A command takes no key, so it has no name to generate.
    null,
  ]);
  // Only the generated ones are news for the profile; the explicit one is not ours
  // to rewrite.
  assert.deepEqual(added, {
    'yandex-new': 'STT_KEY_YANDEX_NEW',
    'openai-transcribe': 'STT_KEY_OPENAI_TRANSCRIBE',
    'whisper-local': 'STT_KEY_WHISPER_LOCAL',
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

test('key presence is read through ctx.get, never through the property', async () => {
  const store = storeOf({ STT_KEY_YANDEX: 'value' });
  const ctx = {
    get: (service) => (service === 'credentials' ? store : null),
    // A Host that did not mount this plugin with `credentials` in `inject` throws
    // on the property; reading it here would turn a presence question into an error.
    get credentials() { throw new Error('cannot get property "credentials" without inject'); },
  };
  assert.equal(await keyPresence('STT_KEY_YANDEX', ctx), true);
  assert.equal(await keyPresence('STT_KEY_OTHER', ctx), false);
  // No store at all is "no key", not a rejection.
  assert.equal(await keyPresence('STT_KEY_YANDEX', { get: () => null }), false);
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
    // A generated name must not turn into a requirement: a whisper server next
    // door usually wants no key, and this record keeps working without one.
    const options = keyed(one({ backend: 'api', baseUrl: 'http://127.0.0.1:8080/v1', model: 'whisper-1', location: 'host-local' }));
    assert.equal(options.apiKeyRef, 'STT_KEY_OPENAI_COMPATIBLE');
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
