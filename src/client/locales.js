// Interface dictionaries: Russian, Chinese and English.
//
// Every key exists in all three — `test/client-locales.test.mjs` compares the key
// sets, because a missing key only shows on somebody else's screen. Provider names
// and credential names come from the host's config and are shown as they are.

export const NS = 'dsh-speech-gate'

export const en = {
  'nav.title': 'Speech recognition',
  'card.title': 'Speech recognition (speech gate)',
  'card.note': 'The SpeechKit key is one and the same for synthesis and recognition; local recognizers need no key.',
  'card.loading': 'Loading recognizers…',
  'card.empty': 'No recognizer here takes a key: the plugin config has nothing to set up.',
  'card.key': 'API key',
  'card.keyPlaceholder': 'Paste the key',
  'card.saveKey': 'Save key',
  'card.saving': 'Saving…',
  'card.keyPresent': 'key saved',
  'card.keyPresentConnector': 'key taken from the model settings',
  'card.keyMissing': 'no key yet',
  'card.keySaved': 'key saved',
  'card.keyUnchanged': 'key unchanged',
  'card.keyStoredAs': 'The key lives under the name {0}.',
  'card.keyWhere': 'Where to get the key: ',
  'card.keyWhereLink': 'Yandex AI Studio console',
  'card.keyWhereAfter': ' → service account → API key.',
  'card.connectorHint': 'may stay empty — the key then comes from the model settings ({0})',
  'card.error': 'Could not save: {0}',
  'card.hint': 'What to know: ',
}

export const ru = {
  'nav.title': 'Распознавание речи',
  'card.title': 'Распознавание речи (speech gate)',
  'card.note': 'Ключ SpeechKit один и тот же для синтеза и распознавания; локальным распознавателям ключ не нужен.',
  'card.loading': 'Загружаю распознаватели…',
  'card.empty': 'Ни одному распознавателю здесь ключ не нужен: в конфиге плагина настраивать нечего.',
  'card.key': 'API-ключ',
  'card.keyPlaceholder': 'Вставьте ключ',
  'card.saveKey': 'Сохранить ключ',
  'card.saving': 'Сохраняю…',
  'card.keyPresent': 'ключ сохранён',
  'card.keyPresentConnector': 'ключ взят из настроек модели',
  'card.keyMissing': 'ключ не задан',
  'card.keySaved': 'ключ сохранён',
  'card.keyUnchanged': 'ключ не изменён',
  'card.keyStoredAs': 'Ключ лежит под именем {0}.',
  'card.keyWhere': 'Где взять ключ: ',
  'card.keyWhereLink': 'Консоль Yandex AI Studio',
  'card.keyWhereAfter': ' → сервисный аккаунт → API-ключ.',
  'card.connectorHint': 'можно не заполнять — тогда ключ берётся из настроек модели ({0})',
  'card.error': 'Не удалось сохранить: {0}',
  'card.hint': 'Что важно знать: ',
}

export const zh = {
  'nav.title': '语音识别',
  'card.title': '语音识别（speech gate）',
  'card.note': 'SpeechKit 的密钥在语音合成与识别之间是同一个；本地识别器不需要密钥。',
  'card.loading': '正在加载识别器…',
  'card.empty': '这里的识别器都不需要密钥：插件配置中没有可设置的内容。',
  'card.key': 'API 密钥',
  'card.keyPlaceholder': '粘贴密钥',
  'card.saveKey': '保存密钥',
  'card.saving': '保存中…',
  'card.keyPresent': '密钥已保存',
  'card.keyPresentConnector': '密钥取自模型设置',
  'card.keyMissing': '尚未设置密钥',
  'card.keySaved': '密钥已保存',
  'card.keyUnchanged': '密钥未改动',
  'card.keyStoredAs': '密钥保存在名称 {0} 下。',
  'card.keyWhere': '获取密钥：',
  'card.keyWhereLink': 'Yandex AI Studio 控制台',
  'card.keyWhereAfter': ' → 服务账号 → API 密钥。',
  'card.connectorHint': '可以留空 — 此时密钥取自模型设置（{0}）',
  'card.error': '保存失败：{0}',
  'card.hint': '需要注意：',
}

export const DICTIONARIES = { en, ru, zh }
