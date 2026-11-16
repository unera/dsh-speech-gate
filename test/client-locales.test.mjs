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
    for (const key of [
      'card.keyStoredAs', 'card.connectorHint', 'card.error',
      'card.enabledNotRegistered', 'card.notUsedReason',
    ]) {
      assert.match(DICTIONARIES[language][key], /\{0\}/u, `${language}.${key} has no {0}`);
    }
  }
});

test('the two notes that explain the key are present and say the right thing', () => {
  // One Yandex key serves every SpeechKit service — and this card stores its own,
  // separately from the synthesizer. The old sentence ("the key is one and the same
  // for synthesis and recognition") was read as "the two are connected", so the new
  // one names the account, not a link between the two plugins.
  assert.match(DICTIONARIES.ru['card.note'], /один ключ на все сервисы SpeechKit/u);
  assert.match(DICTIONARIES.ru['card.note'], /отдельно от синтеза/u);
  assert.match(DICTIONARIES.ru['card.note'], /тот же или другой/u);
  assert.doesNotMatch(DICTIONARIES.ru['card.note'], /один и тот же для синтеза и распознавания/u);
  assert.doesNotMatch(DICTIONARIES.ru['card.note'], /локальным распознавателям ключ не нужен/u);
  // The connector note says the field may stay empty and where the key then comes from.
  assert.match(DICTIONARIES.ru['card.connectorHint'], /можно не заполнять/u);
  assert.match(DICTIONARIES.ru['card.connectorHint'], /настроек модели/u);
  // A value that came from the connector says so in the chip.
  assert.match(DICTIONARIES.ru['card.keyPresentConnector'], /настроек модели/u);
  // The console the hint points at is named, not just linked.
  assert.match(DICTIONARIES.ru['card.keyWhereLink'], /Yandex/u);
  assert.match(DICTIONARIES.ru['card.keyWhereAfter'], /API/u);
});

test('the header says where the recognizer itself is chosen — in all three languages', () => {
  // The card configures candidates; the choice is made on another page. Without
  // this line a person edits the wrong screen and calls the recognizer broken.
  assert.match(DICTIONARIES.ru['card.sourceHint'], /Плагины/u);
  assert.match(DICTIONARIES.ru['card.sourceHint'], /Голосовой ввод/u);
  assert.match(DICTIONARIES.ru['card.sourceHint'], /Сервис распознавания/u);

  assert.match(DICTIONARIES.en['card.sourceHint'], /Plugins/u);
  assert.match(DICTIONARIES.en['card.sourceHint'], /Voice input/u);
  assert.match(DICTIONARIES.en['card.sourceHint'], /Recognition service/u);

  assert.match(DICTIONARIES.zh['card.sourceHint'], /插件/u);
  assert.match(DICTIONARIES.zh['card.sourceHint'], /语音输入/u);
  assert.match(DICTIONARIES.zh['card.sourceHint'], /识别服务/u);
});

test('every reason the host can send is translated in all three languages', () => {
  const reasons = [
    'no-key', 'no-connector', 'disabled', 'credentials-service-missing', 'key-unknown', 'not-configured',
  ];
  for (const language of languages) {
    for (const word of reasons) {
      const key = `reason.${word.replace(/-(\w)/gu, (_, letter) => letter.toUpperCase())}`;
      assert.equal(typeof DICTIONARIES[language][key], 'string', `${language} has no ${key} (${word})`);
    }
    // "switched on, but not registered: <reason>" — the sentence the switch answer
    // needs, because «провайдер выключен» would blame the person's own switch.
    assert.match(DICTIONARIES[language]['card.enabledNotRegistered'], /\{0\}/u);
    assert.match(DICTIONARIES[language]['card.enabledNotRegistered'], /включён|enabled|已启用/iu);
  }
});

test('the local and unconfigured lines exist in every language', () => {
  for (const language of languages) {
    // A local recognizer says the key is not needed, in those words.
    assert.match(DICTIONARIES[language]['card.localNoKey'], /локальный|local|本地/iu);
    // A record nobody configured says it takes no part, not just "no key yet".
    assert.match(DICTIONARIES[language]['card.noKeyUnused'], /не используется|not used|未被使用/iu);
    // The switch's own label and the two answers it can give.
    assert.notEqual(DICTIONARIES[language]['card.enabled'].trim(), '');
    assert.notEqual(DICTIONARIES[language]['card.enabledOn'].trim(), '');
    assert.notEqual(DICTIONARIES[language]['card.enabledOff'].trim(), '');
  }
});
