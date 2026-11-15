// The card's dictionaries: three languages, one key set, and the sentences that
// carry the two facts a person must not miss — the key name is derived, and the
// SpeechKit key is shared with synthesis.
import assert from 'node:assert/strict'
import test from 'node:test'

import { DICTIONARIES, NS } from '../src/client/locales.js'

const languages = Object.keys(DICTIONARIES)
const keysOf = (dictionary) => Object.keys(dictionary).sort()

test('the namespace is a plain id', () => {
  assert.match(NS, /^[a-z][a-z0-9-]*$/u);
  assert.equal(NS, 'dsh-speech-gate');
  assert.deepEqual(languages.sort(), ['en', 'ru', 'zh']);
});

test('every language has exactly the same keys', () => {
  const reference = keysOf(DICTIONARIES.en);
  for (const language of languages) {
    assert.deepEqual(keysOf(DICTIONARIES[language]), reference, `${language} keys differ from en`);
  }
});

test('no entry is empty and every entry is a string', () => {
  for (const language of languages) {
    for (const [key, value] of Object.entries(DICTIONARIES[language])) {
      assert.equal(typeof value, 'string', `${language}.${key} is not a string`);
      assert.notEqual(value.trim(), '', `${language}.${key} is empty`);
    }
  }
});

test('russian is actually translated, not copied from english', () => {
  const latin = (value) => /^[\x00-\x7F]+$/u.test(value);
  const copied = Object.keys(DICTIONARIES.en).filter(
    (key) => latin(DICTIONARIES.en[key]) && DICTIONARIES.en[key] === DICTIONARIES.ru[key],
  );
  assert.deepEqual(copied, [], `these keys are still english in ru: ${copied.join(', ')}`);
});

test('the placeholders the card fills in exist in every language', () => {
  for (const language of languages) {
    for (const key of ['card.keyStoredAs', 'card.connectorHint', 'card.error']) {
      assert.match(DICTIONARIES[language][key], /\{0\}/u, `${language}.${key} has no {0}`);
    }
  }
});

test('the two notes that explain the key are present and say the right thing', () => {
  // The shared SpeechKit key: one account for both directions.
  assert.match(DICTIONARIES.ru['card.note'], /SpeechKit/u);
  assert.match(DICTIONARIES.ru['card.note'], /синтез/u);
  assert.match(DICTIONARIES.ru['card.note'], /распознаван/u);
  // The connector note says the field may stay empty and where the key then comes from.
  assert.match(DICTIONARIES.ru['card.connectorHint'], /можно не заполнять/u);
  assert.match(DICTIONARIES.ru['card.connectorHint'], /настроек модели/u);
  // A value that came from the connector says so in the chip.
  assert.match(DICTIONARIES.ru['card.keyPresentConnector'], /настроек модели/u);
  // The console the hint points at is named, not just linked.
  assert.match(DICTIONARIES.ru['card.keyWhereLink'], /Yandex/u);
  assert.match(DICTIONARIES.ru['card.keyWhereAfter'], /API/u);
});
