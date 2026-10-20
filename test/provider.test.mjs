import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  apply,
  normalizeConfig,
  resolveApiKey,
  runCommand,
  stripOutput,
  transcribeViaApi,
  wavSeconds,
} from '../index.mjs';

/** The single provider a flat config produces. */
function one(config) {
  return normalizeConfig(config).providers[0];
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
