// The two calls the card makes, against a stubbed `fetch`.
//
// The transport is small enough to look obviously right, which is exactly why it
// gets a test: a wrong path or a missing body is a card that silently shows nothing.
import assert from 'node:assert/strict'
import test from 'node:test'

import { getState, saveCredential } from '../src/client/api.js'

/**
 * Replace `globalThis.fetch` for one call.
 * @param answer - the response to hand back.
 * @param run - the call to make.
 * @returns the result and the recorded calls.
 */
async function withFetch(answer, run) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return typeof answer === 'function' ? answer(url, options) : answer;
  };
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('the state is read from the plugin\'s own route on the authenticated channel', async () => {
  const snapshot = { providers: [{ id: 'yandex-stt', apiKeyRef: 'YANDEX_SPEECHKIT_API_KEY', keyPresent: true }] };
  const { result, calls } = await withFetch(jsonResponse(snapshot), () => getState());

  assert.deepEqual(result, snapshot);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/speech-gate/state');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.method, undefined, 'a read is a plain GET');
});

test('a key is one POST carrying the name and the value, nothing else', async () => {
  const { result, calls } = await withFetch(jsonResponse({ ok: true, ref: 'STT_KEY_YANDEX_NEW', present: true }),
    () => saveCredential('STT_KEY_YANDEX_NEW', 'secret'));

  assert.deepEqual(result, { ok: true, ref: 'STT_KEY_YANDEX_NEW', present: true });
  assert.equal(calls[0].url, '/api/speech-gate/credential');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { ref: 'STT_KEY_YANDEX_NEW', value: 'secret' });
});

test('an empty value travels as it stands: the host decides what it means', async () => {
  const { calls } = await withFetch(jsonResponse({ ok: true, ref: 'STT_KEY_A', present: true, unchanged: true }),
    () => saveCredential('STT_KEY_A', ''));
  assert.deepEqual(JSON.parse(calls[0].options.body), { ref: 'STT_KEY_A', value: '' });
});

test('a refusal arrives as the host\'s own words plus its status and code', async () => {
  await assert.rejects(
    withFetch(jsonResponse({ code: 'empty_value', error: 'значение ключа пустое' }, 400),
      () => saveCredential('STT_KEY_A', '')),
    (error) => {
      assert.equal(error.message, 'значение ключа пустое');
      assert.equal(error.status, 400);
      assert.equal(error.code, 'empty_value');
      return true;
    },
  );
});

test('an answer that is not JSON still refuses, with the status as the message', async () => {
  await assert.rejects(
    withFetch(new Response('', { status: 502, statusText: 'Bad Gateway' }), () => getState()),
    /502 Bad Gateway/,
  );
});

test('an empty successful body reads as no state instead of a parse crash', async () => {
  const { result } = await withFetch(new Response('', { status: 200 }), () => getState());
  assert.equal(result, null);
});
