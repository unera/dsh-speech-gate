window.__ModuleLoader__.load({
  id: "@dr-co/dsh-speech-gate",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  SECTION_ID: () => SECTION_ID,
  SECTION_ORDER: () => SECTION_ORDER,
  apply: () => apply,
  id: () => id,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/locales.js
var NS = "dsh-speech-gate";
var en = {
  "nav.title": "Speech recognition",
  "card.title": "Speech recognition (speech gate)",
  "card.sourceHint": 'Which recognizer is used is chosen on the "Plugins" page \u2192 "Voice input" \u2192 "Recognition service".',
  "card.note": "Yandex has one key for all SpeechKit services. It is stored here separately from synthesis \u2014 you may use the same key or a different one.",
  "card.loading": "Loading recognizers\u2026",
  "card.empty": "There is nothing to set up here: the plugin config has no recognizer this card could show.",
  "card.key": "API key",
  "card.localNoKey": "local recognizer, no key needed",
  "card.noKeyUnused": "no key \u2014 this provider is not used",
  "card.enabled": "enabled",
  "card.enabledOn": "provider enabled",
  "card.enabledOff": "provider disabled",
  "card.keyPlaceholder": "Paste the key",
  "card.saveKey": "Save key",
  "card.saving": "Saving\u2026",
  "card.keyPresent": "key saved",
  "card.keyPresentConnector": "key taken from the model settings",
  "card.keyMissing": "no key yet",
  "card.keySaved": "key saved",
  "card.keyUnchanged": "key unchanged",
  "card.keyStoredAs": "The key lives under the name {0}.",
  "card.keyWhere": "Where to get the key: ",
  "card.keyWhereLink": "Yandex AI Studio console",
  "card.keyWhereAfter": " \u2192 service account \u2192 API key.",
  "card.connectorHint": "may stay empty \u2014 the key then comes from the model settings ({0})",
  "card.error": "Could not save: {0}",
  "card.hint": "What to know: ",
  "card.enabledNotRegistered": "enabled, but not registered: {0}",
  "card.notUsedReason": "not used: {0}",
  "reason.noKey": "no key",
  "reason.noConnector": "the model connector is not configured in this Host",
  "reason.disabled": "switched off",
  "reason.credentialsServiceMissing": "the credentials service has not mounted yet",
  "reason.keyUnknown": "the credentials store did not answer",
  "reason.notConfigured": "this record has nothing to transcribe with"
};
var ru = {
  "nav.title": "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438",
  "card.title": "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438 (speech gate)",
  "card.sourceHint": "\u041A\u0430\u043A\u043E\u0439 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u2014 \u0432\u044B\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \xAB\u041F\u043B\u0430\u0433\u0438\u043D\u044B\xBB \u2192 \xAB\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u0432\u0432\u043E\u0434\xBB \u2192 \xAB\u0421\u0435\u0440\u0432\u0438\u0441 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F\xBB.",
  "card.note": "\u0423 \u042F\u043D\u0434\u0435\u043A\u0441\u0430 \u043E\u0434\u0438\u043D \u043A\u043B\u044E\u0447 \u043D\u0430 \u0432\u0441\u0435 \u0441\u0435\u0440\u0432\u0438\u0441\u044B SpeechKit. \u0417\u0434\u0435\u0441\u044C \u043E\u043D \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043E\u0442 \u0441\u0438\u043D\u0442\u0435\u0437\u0430 \u2014 \u043C\u043E\u0436\u043D\u043E \u0443\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u043E\u0442 \u0436\u0435 \u0438\u043B\u0438 \u0434\u0440\u0443\u0433\u043E\u0439.",
  "card.loading": "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044E \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u0438\u2026",
  "card.empty": "\u041D\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0442\u044C \u0437\u0434\u0435\u0441\u044C \u043D\u0435\u0447\u0435\u0433\u043E: \u0432 \u043A\u043E\u043D\u0444\u0438\u0433\u0435 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u043D\u0435\u0442 \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044F, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043F\u043E\u043A\u0430\u0437\u0430\u043B\u0430 \u0431\u044B \u044D\u0442\u0430 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430.",
  "card.key": "API-\u043A\u043B\u044E\u0447",
  "card.localNoKey": "\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044C, \u043A\u043B\u044E\u0447 \u043D\u0435 \u043D\u0443\u0436\u0435\u043D",
  "card.noKeyUnused": "\u043D\u0435\u0442 \u043A\u043B\u044E\u0447\u0430 \u2014 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F",
  "card.enabled": "\u0432\u043A\u043B\u044E\u0447\u0451\u043D",
  "card.enabledOn": "\u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u0432\u043A\u043B\u044E\u0447\u0451\u043D",
  "card.enabledOff": "\u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D",
  "card.keyPlaceholder": "\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043A\u043B\u044E\u0447",
  "card.saveKey": "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u043B\u044E\u0447",
  "card.saving": "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u2026",
  "card.keyPresent": "\u043A\u043B\u044E\u0447 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D",
  "card.keyPresentConnector": "\u043A\u043B\u044E\u0447 \u0432\u0437\u044F\u0442 \u0438\u0437 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A \u043C\u043E\u0434\u0435\u043B\u0438",
  "card.keyMissing": "\u043A\u043B\u044E\u0447 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D",
  "card.keySaved": "\u043A\u043B\u044E\u0447 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D",
  "card.keyUnchanged": "\u043A\u043B\u044E\u0447 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D",
  "card.keyStoredAs": "\u041A\u043B\u044E\u0447 \u043B\u0435\u0436\u0438\u0442 \u043F\u043E\u0434 \u0438\u043C\u0435\u043D\u0435\u043C {0}.",
  "card.keyWhere": "\u0413\u0434\u0435 \u0432\u0437\u044F\u0442\u044C \u043A\u043B\u044E\u0447: ",
  "card.keyWhereLink": "\u041A\u043E\u043D\u0441\u043E\u043B\u044C Yandex AI Studio",
  "card.keyWhereAfter": " \u2192 \u0441\u0435\u0440\u0432\u0438\u0441\u043D\u044B\u0439 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u2192 API-\u043A\u043B\u044E\u0447.",
  "card.connectorHint": "\u043C\u043E\u0436\u043D\u043E \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0442\u044C \u2014 \u0442\u043E\u0433\u0434\u0430 \u043A\u043B\u044E\u0447 \u0431\u0435\u0440\u0451\u0442\u0441\u044F \u0438\u0437 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A \u043C\u043E\u0434\u0435\u043B\u0438 ({0})",
  "card.error": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C: {0}",
  "card.hint": "\u0427\u0442\u043E \u0432\u0430\u0436\u043D\u043E \u0437\u043D\u0430\u0442\u044C: ",
  "card.enabledNotRegistered": "\u0432\u043A\u043B\u044E\u0447\u0451\u043D, \u043D\u043E \u043D\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D: {0}",
  "card.notUsedReason": "\u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F: {0}",
  "reason.noKey": "\u043D\u0435\u0442 \u043A\u043B\u044E\u0447\u0430",
  "reason.noConnector": "\u0432 \u0445\u043E\u0441\u0442\u0435 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D \u043A\u043E\u043D\u043D\u0435\u043A\u0442\u043E\u0440 \u043C\u043E\u0434\u0435\u043B\u0438",
  "reason.disabled": "\u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0442\u0435\u043B\u0435\u043C",
  "reason.credentialsServiceMissing": "\u0441\u043B\u0443\u0436\u0431\u0430 \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u043D\u044F\u043B\u0430\u0441\u044C",
  "reason.keyUnknown": "\u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445 \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B\u043E",
  "reason.notConfigured": "\u044D\u0442\u043E\u043C\u0443 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044E \u043D\u0435\u0447\u0435\u043C \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u044C"
};
var zh = {
  "nav.title": "\u8BED\u97F3\u8BC6\u522B",
  "card.title": "\u8BED\u97F3\u8BC6\u522B\uFF08speech gate\uFF09",
  "card.sourceHint": "\u4F7F\u7528\u54EA\u4E2A\u8BC6\u522B\u5668\uFF0C\u5728\u201C\u63D2\u4EF6\u201D\u9875\u9762 \u2192\u201C\u8BED\u97F3\u8F93\u5165\u201D\u2192\u201C\u8BC6\u522B\u670D\u52A1\u201D\u4E2D\u9009\u62E9\u3002",
  "card.note": "Yandex \u7684\u6240\u6709 SpeechKit \u670D\u52A1\u5171\u7528\u4E00\u4E2A\u5BC6\u94A5\u3002\u8FD9\u91CC\u7684\u5BC6\u94A5\u4E0E\u8BED\u97F3\u5408\u6210\u5206\u5F00\u4FDD\u5B58 \u2014 \u53EF\u4EE5\u586B\u540C\u4E00\u4E2A\uFF0C\u4E5F\u53EF\u4EE5\u586B\u53E6\u4E00\u4E2A\u3002",
  "card.loading": "\u6B63\u5728\u52A0\u8F7D\u8BC6\u522B\u5668\u2026",
  "card.empty": "\u8FD9\u91CC\u6CA1\u6709\u53EF\u8BBE\u7F6E\u7684\u5185\u5BB9\uFF1A\u63D2\u4EF6\u914D\u7F6E\u4E2D\u6CA1\u6709\u672C\u5361\u7247\u53EF\u663E\u793A\u7684\u8BC6\u522B\u5668\u3002",
  "card.key": "API \u5BC6\u94A5",
  "card.localNoKey": "\u672C\u5730\u8BC6\u522B\u5668\uFF0C\u4E0D\u9700\u8981\u5BC6\u94A5",
  "card.noKeyUnused": "\u6CA1\u6709\u5BC6\u94A5 \u2014 \u8BE5\u63D0\u4F9B\u65B9\u672A\u88AB\u4F7F\u7528",
  "card.enabled": "\u5DF2\u542F\u7528",
  "card.enabledOn": "\u63D0\u4F9B\u65B9\u5DF2\u542F\u7528",
  "card.enabledOff": "\u63D0\u4F9B\u65B9\u5DF2\u505C\u7528",
  "card.keyPlaceholder": "\u7C98\u8D34\u5BC6\u94A5",
  "card.saveKey": "\u4FDD\u5B58\u5BC6\u94A5",
  "card.saving": "\u4FDD\u5B58\u4E2D\u2026",
  "card.keyPresent": "\u5BC6\u94A5\u5DF2\u4FDD\u5B58",
  "card.keyPresentConnector": "\u5BC6\u94A5\u53D6\u81EA\u6A21\u578B\u8BBE\u7F6E",
  "card.keyMissing": "\u5C1A\u672A\u8BBE\u7F6E\u5BC6\u94A5",
  "card.keySaved": "\u5BC6\u94A5\u5DF2\u4FDD\u5B58",
  "card.keyUnchanged": "\u5BC6\u94A5\u672A\u6539\u52A8",
  "card.keyStoredAs": "\u5BC6\u94A5\u4FDD\u5B58\u5728\u540D\u79F0 {0} \u4E0B\u3002",
  "card.keyWhere": "\u83B7\u53D6\u5BC6\u94A5\uFF1A",
  "card.keyWhereLink": "Yandex AI Studio \u63A7\u5236\u53F0",
  "card.keyWhereAfter": " \u2192 \u670D\u52A1\u8D26\u53F7 \u2192 API \u5BC6\u94A5\u3002",
  "card.connectorHint": "\u53EF\u4EE5\u7559\u7A7A \u2014 \u6B64\u65F6\u5BC6\u94A5\u53D6\u81EA\u6A21\u578B\u8BBE\u7F6E\uFF08{0}\uFF09",
  "card.error": "\u4FDD\u5B58\u5931\u8D25\uFF1A{0}",
  "card.hint": "\u9700\u8981\u6CE8\u610F\uFF1A",
  "card.enabledNotRegistered": "\u5DF2\u542F\u7528\uFF0C\u4F46\u672A\u6CE8\u518C\uFF1A{0}",
  "card.notUsedReason": "\u672A\u88AB\u4F7F\u7528\uFF1A{0}",
  "reason.noKey": "\u6CA1\u6709\u5BC6\u94A5",
  "reason.noConnector": "\u4E3B\u673A\u4E2D\u672A\u914D\u7F6E\u6A21\u578B\u8FDE\u63A5\u5668",
  "reason.disabled": "\u5DF2\u88AB\u5F00\u5173\u5173\u95ED",
  "reason.credentialsServiceMissing": "\u51ED\u636E\u670D\u52A1\u5C1A\u672A\u542F\u52A8",
  "reason.keyUnknown": "\u51ED\u636E\u5E93\u6CA1\u6709\u54CD\u5E94",
  "reason.notConfigured": "\u8BE5\u8BC6\u522B\u5668\u6CA1\u6709\u53EF\u7528\u7684\u8BC6\u522B\u65B9\u5F0F"
};
var DICTIONARIES = { en, ru, zh };

// src/client/styles.js
var STYLE_ID = "dsh-speech-gate-styles";
var CSS = `
.dsg { display: flex; flex-direction: column; gap: 14px; max-width: 780px; min-width: 0; }
.dsg-title { font-size: 20px; font-weight: 600; margin: 0; }
.dsg-list { display: flex; flex-direction: column; gap: 10px; list-style: none; margin: 0; padding: 0; }
.dsg-provider {
  border: 1px solid rgba(127,127,127,.25); border-radius: 8px; display: flex;
  flex-direction: column; gap: 8px; padding: 10px 12px; min-width: 0;
}
.dsg-provider-head { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
.dsg-provider-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsg-provider-id {
  background: rgba(127,127,127,.12); border-radius: 4px; font-size: 11px;
  padding: 1px 5px; opacity: .75;
}
.dsg-key-state { font-size: 12px; font-weight: 600; margin-left: 4px; }
.dsg-key-ok { color: #3fb950; font-size: 12px; font-weight: 600; }
.dsg-key-off { color: #d29922; font-size: 12px; font-weight: 600; }
/* A local recognizer needs no key: that is a fact, not a missing value. */
.dsg-key-local { color: #8b949e; font-size: 12px; font-weight: 600; }
/* The field's own heading. It is a block of its own and the state chip lives
   elsewhere: laid out as one run of inline text the two read as \xABAPI-\u043A\u043B\u044E\u0447\u043A\u043B\u044E\u0447
   \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\xBB, which is exactly what this rule and .dsg-key-state prevent. */
.dsg-field-label { flex: 0 0 auto; font-size: 12px; font-weight: 600; margin-right: 2px; }
.dsg-key-row { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; min-width: 0; }
/* A record nobody configured takes part in nothing: drawn greyed out, with the
   sentence saying so under the field it is missing a value for. */
.dsg-provider-off { opacity: .55; }
.dsg-unconfigured { color: #d29922; opacity: .9; }
.dsg-switch { align-items: center; display: inline-flex; gap: 6px; font-size: 12px; width: fit-content; }
.dsg-switch-input { accent-color: #3fb950; cursor: pointer; height: 14px; margin: 0; width: 14px; }
.dsg-switch-input:disabled { cursor: default; opacity: .55; }
.dsg-switch-label { user-select: none; }
.dsg-source { opacity: .75; }
.dsg-input {
  background: transparent; border: 1px solid rgba(127,127,127,.35); border-radius: 6px;
  box-sizing: border-box; color: inherit; color-scheme: dark; font: inherit;
  font-size: 13px; max-width: 320px; min-width: 160px; padding: 6px 9px;
}
.dsg-input:disabled { cursor: default; opacity: .55; }
/* The key field is a one-row <textarea> rather than an <input type="password">: a
   password box invites the password manager, and the value here is a machine token,
   not a person's password. It has to look like a single-line input all the same \u2014
   fixed height, no resize handle, no scrollbar, exactly as tall as the button next
   to it. flex: 0 0 auto is the load-bearing part: inside a column flex container
   the .dsg-input rule's flex-basis would become a height and win over the height
   below, which is how this field grows to half the panel. */
.dsg-key-input { flex: 0 0 auto; height: 30px; line-height: 28px; overflow: hidden; padding: 0 9px; resize: none; white-space: pre; word-break: normal; }
.dsg-key-row .dsg-button { box-sizing: border-box; height: 30px; padding: 0 12px; }
.dsg-button {
  background: transparent; border: 1px solid rgba(127,127,127,.45); border-radius: 6px;
  color: inherit; cursor: pointer; font: inherit; font-size: 13px; padding: 6px 12px;
}
.dsg-button:disabled { cursor: default; opacity: .55; }
.dsg-connector { font-size: 12px; line-height: 1.45; margin: 0; max-width: 46em; opacity: .75; }
.dsg-connector-name { font-family: ui-monospace, monospace; opacity: .9; }
.dsg-connector-note { opacity: .6; }
.dsg-note { font-size: 12px; line-height: 1.45; margin: 0; max-width: 46em; opacity: .6; }
.dsg-hint { color: #d29922; font-size: 12px; line-height: 1.45; margin: 0; max-width: 46em; }
.dsg-hint a { color: inherit; }
.dsg-ok { color: #3fb950; font-size: 12px; line-height: 1.45; margin: 0; }
.dsg-error { color: #e05252; font-size: 12px; line-height: 1.45; margin: 0; max-width: 46em; }
`;
function mountStyle(document = globalThis.document) {
  if (document === void 0 || document === null || typeof document.createElement !== "function") {
    return () => {
    };
  }
  if (document.getElementById?.(STYLE_ID) !== null && document.getElementById?.(STYLE_ID) !== void 0) {
    return () => {
    };
  }
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = CSS;
  (document.head ?? document.body ?? document).appendChild(element);
  return () => {
    try {
      element.remove();
    } catch {
    }
  };
}

// src/client/card.js
var import_react = require("react");

// src/client/api.js
var BASE = "/api/speech-gate";
async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    ...options
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text === "" ? null : JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const error = new Error(parsed?.error ?? `${response.status} ${response.statusText}`);
    error.status = response.status;
    if (typeof parsed?.code === "string") error.code = parsed.code;
    throw error;
  }
  return parsed;
}
var getState = () => request("/state");
var saveCredential = (ref, value) => request("/credential", { method: "POST", body: JSON.stringify({ ref, value }) });
var saveEnabled = (id2, enabled) => request("/enabled", { method: "POST", body: JSON.stringify({ id: id2, enabled }) });

// src/client/card.js
var KEY_CONSOLE_URL = "https://aistudio.yandex.cloud/platform/";
var messageOf = (error) => String(error?.message ?? error);
function providerRows(snapshot) {
  const rows = Array.isArray(snapshot?.providers) ? snapshot.providers : [];
  return rows.filter((row) => row !== null && typeof row === "object" && typeof row.id === "string" && row.id !== "").map((row) => ({
    id: row.id,
    name: typeof row.name === "string" && row.name !== "" ? row.name : row.id,
    provider: typeof row.provider === "string" ? row.provider : null,
    apiKeyRef: typeof row.apiKeyRef === "string" && row.apiKeyRef !== "" ? row.apiKeyRef : null,
    // The connector's credential, when this record may fall back to it.
    connectorRef: typeof row.connectorRef === "string" && row.connectorRef !== "" ? row.connectorRef : null,
    keyPresent: row.keyPresent === true,
    // `own` (a value under this record's name), `connector` (the model
    // settings answer instead) or nothing at all.
    keySource: row.keySource === "own" || row.keySource === "connector" ? row.keySource : null,
    // Runs on this machine: no key, and the card says so instead of a field.
    local: row.local === true,
    // The switch, and whether the record has everything it needs. A record
    // nobody configured is shown greyed out: it takes no part in recognition.
    enabled: row.enabled !== false,
    configured: row.configured === true,
    // Why the host does not offer it (`no-key`, `no-connector`, `disabled`, …),
    // so the grey line names the real reason instead of always "no key".
    reason: typeof row.reason === "string" && row.reason !== "" ? row.reason : null
  }));
}
function reasonText(t, reason) {
  const known = {
    "no-key": "reason.noKey",
    "no-connector": "reason.noConnector",
    disabled: "reason.disabled",
    "credentials-service-missing": "reason.credentialsServiceMissing",
    "key-unknown": "reason.keyUnknown",
    "not-configured": "reason.notConfigured"
  };
  const key = typeof reason === "string" ? known[reason] : void 0;
  return key === void 0 ? String(reason ?? "") : t(key);
}
function notRegisteredText(t, reason) {
  return String(t("card.enabledNotRegistered")).replace("{0}", reasonText(t, reason));
}
function unconfiguredText(t, row) {
  const reason = typeof row?.reason === "string" && row.reason !== "" ? row.reason : null;
  if (reason === null || reason === "no-key") return t("card.noKeyUnused");
  return String(t("card.notUsedReason")).replace("{0}", reasonText(t, reason));
}
function showsKeyField(row) {
  return typeof row?.apiKeyRef === "string" && row.apiKeyRef !== "";
}
function isLocalRow(row) {
  return row?.local === true;
}
function showsEnabledSwitch(row) {
  return row?.configured === true;
}
function isUnconfiguredRow(row) {
  return row?.configured !== true;
}
function isYandexProvider(row) {
  return row?.provider === "yandex" || row?.id === "yandex";
}
function keyStateText(t, row) {
  if (isLocalRow(row)) return t("card.localNoKey");
  if (row?.keyPresent !== true) return t("card.keyMissing");
  return row.keySource === "connector" ? t("card.keyPresentConnector") : t("card.keyPresent");
}
function keyStateOf(row) {
  if (isLocalRow(row)) return "local";
  return row?.keyPresent === true ? "present" : "missing";
}
function connectorHintText(t, row) {
  if (typeof row?.connectorRef !== "string" || row.connectorRef === "") return null;
  return String(t("card.connectorHint")).replace("{0}", row.connectorRef);
}
function button(label, onClick, options = {}) {
  return (0, import_react.createElement)("button", {
    className: "dsg-button",
    type: "button",
    disabled: options.disabled === true,
    title: label,
    onClick
  }, label);
}
function SpeechGateView(props) {
  const t = typeof props?.t === "function" ? props.t : (key) => key;
  const providers = Array.isArray(props?.providers) ? props.providers : [];
  const drafts = props?.drafts ?? {};
  const notices = props?.notices ?? {};
  const busy = typeof props?.busy === "string" ? props.busy : null;
  const onChange = typeof props?.onChange === "function" ? props.onChange : () => {
  };
  const onSave = typeof props?.onSave === "function" ? props.onSave : () => {
  };
  const onToggle = typeof props?.onToggle === "function" ? props.onToggle : () => {
  };
  const children = [(0, import_react.createElement)("h2", { className: "dsg-title" }, t("card.title"))];
  children.push((0, import_react.createElement)("p", {
    className: "dsg-note dsg-source",
    "data-source-hint": "true"
  }, t("card.sourceHint")));
  children.push((0, import_react.createElement)("p", { className: "dsg-note" }, t("card.note")));
  if (props?.loading === true) {
    children.push((0, import_react.createElement)("p", { className: "dsg-note" }, t("card.loading")));
  } else if (providers.length === 0) {
    children.push((0, import_react.createElement)("p", { className: "dsg-note" }, t("card.empty")));
  } else {
    const rows = providers.map((row) => {
      const saving = busy === row.id;
      const notice = notices[row.id] ?? null;
      const local = isLocalRow(row);
      const fields = [
        (0, import_react.createElement)(
          "div",
          { className: "dsg-provider-head", key: "head" },
          (0, import_react.createElement)("span", { className: "dsg-provider-name" }, row.name),
          (0, import_react.createElement)("code", { className: "dsg-provider-id" }, row.id),
          (0, import_react.createElement)("span", {
            className: local ? "dsg-key-local dsg-key-state" : row.keyPresent ? "dsg-key-ok dsg-key-state" : "dsg-key-off dsg-key-state",
            "data-key-state": keyStateOf(row)
          }, keyStateText(t, row))
        )
      ];
      if (showsKeyField(row)) {
        fields.push(
          // The label and the state are two separate elements on purpose: drawn as
          // one run of text they read as «API-ключключ сохранён» on the live screen.
          (0, import_react.createElement)(
            "div",
            { className: "dsg-key-row", key: "row" },
            (0, import_react.createElement)("span", { className: "dsg-field-label" }, t("card.key")),
            (0, import_react.createElement)("textarea", {
              className: "dsg-input dsg-key-input",
              // One row and a fixed height: a key is one line, and a box that can
              // be dragged taller would push the rest of the card away.
              rows: 1,
              // No password box: this is a machine token, and the password manager
              // has no business offering to remember it.
              autoComplete: "off",
              autoCapitalize: "off",
              autoCorrect: "off",
              spellCheck: false,
              placeholder: t("card.keyPlaceholder"),
              "aria-label": t("card.key"),
              value: typeof drafts[row.id] === "string" ? drafts[row.id] : "",
              disabled: saving,
              onChange: (event) => onChange(row.id, event?.target?.value ?? "")
            }),
            button(t("card.saveKey"), () => onSave(row.id), {
              disabled: saving
            })
          )
        );
        fields.push((0, import_react.createElement)(
          "p",
          { className: "dsg-note", key: "name" },
          String(t("card.keyStoredAs")).replace("{0}", row.apiKeyRef)
        ));
        const connectorHint = connectorHintText(t, row);
        if (connectorHint !== null) {
          fields.push((0, import_react.createElement)("p", { className: "dsg-note", key: "connector" }, connectorHint));
        }
        if (isYandexProvider(row)) {
          fields.push((0, import_react.createElement)(
            "p",
            { className: "dsg-hint", key: "hint" },
            t("card.keyWhere"),
            (0, import_react.createElement)("a", { href: KEY_CONSOLE_URL, target: "_blank", rel: "noreferrer" }, t("card.keyWhereLink")),
            t("card.keyWhereAfter")
          ));
        }
      }
      if (isUnconfiguredRow(row)) {
        fields.push((0, import_react.createElement)("p", {
          className: "dsg-note dsg-unconfigured",
          key: "unused",
          "data-unconfigured": "true"
        }, unconfiguredText(t, row)));
      }
      if (showsEnabledSwitch(row)) {
        fields.push((0, import_react.createElement)(
          "label",
          { className: "dsg-switch", key: "enabled" },
          (0, import_react.createElement)("input", {
            type: "checkbox",
            className: "dsg-switch-input",
            checked: row.enabled !== false,
            disabled: saving,
            "aria-label": t("card.enabled"),
            onChange: (event) => onToggle(row.id, event?.target?.checked === true)
          }),
          (0, import_react.createElement)("span", { className: "dsg-switch-label" }, t("card.enabled"))
        ));
      }
      if (notice !== null) {
        fields.push((0, import_react.createElement)(
          "p",
          { className: notice.kind === "error" ? "dsg-error" : "dsg-ok", key: "notice" },
          notice.text ?? ""
        ));
      }
      return (0, import_react.createElement)("li", {
        key: row.id,
        className: isUnconfiguredRow(row) ? "dsg-provider dsg-provider-off" : "dsg-provider",
        "data-provider": row.id,
        "data-key-source": row.keySource ?? "none",
        "data-local": local ? "true" : "false",
        "data-enabled": row.enabled === false ? "false" : "true",
        "data-configured": isUnconfiguredRow(row) ? "false" : "true"
      }, ...fields);
    });
    children.push((0, import_react.createElement)("ul", { className: "dsg-list" }, ...rows));
  }
  if (props?.error !== null && props?.error !== void 0) {
    children.push((0, import_react.createElement)("p", { className: "dsg-error" }, t("card.error").replace("{0}", String(props.error))));
  }
  return (0, import_react.createElement)("section", { className: "dsg" }, ...children);
}
var CardBoundary = class extends import_react.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    const t = typeof this.props?.t === "function" ? this.props.t : (key) => key;
    if (this.state.error === null) return this.props.children;
    return (0, import_react.createElement)(
      "section",
      { className: "dsg" },
      // The host's own dictionary, not a line frozen in Russian: an English or
      // Chinese page must not grow a Russian heading exactly when it broke.
      (0, import_react.createElement)("h2", { className: "dsg-title" }, t("nav.title")),
      (0, import_react.createElement)("p", { className: "dsg-error" }, messageOf(this.state.error))
    );
  }
};
function SpeechGatePage(props) {
  return (0, import_react.createElement)(CardBoundary, { t: props?.t }, (0, import_react.createElement)(SpeechGateCard, props));
}
function SpeechGateCard(props) {
  const t = typeof props?.t === "function" ? props.t : (key) => key;
  const [state, setState] = (0, import_react.useState)({ loading: true, providers: [], error: null });
  const [drafts, setDrafts] = (0, import_react.useState)({});
  const [busy, setBusy] = (0, import_react.useState)(null);
  const [notices, setNotices] = (0, import_react.useState)({});
  const apply2 = (snapshot) => setState({ loading: false, providers: providerRows(snapshot), error: null });
  const say = (id2, kind, text) => {
    setNotices((previous) => ({ ...previous, [id2]: { kind, text } }));
  };
  (0, import_react.useEffect)(() => {
    let alive = true;
    getState().then((snapshot) => {
      if (alive) apply2(snapshot);
    }).catch((error) => {
      if (alive) setState((previous) => ({ ...previous, loading: false, error: messageOf(error) }));
    });
    return () => {
      alive = false;
    };
  }, []);
  const onSave = (id2) => {
    const row = state.providers.find((entry) => entry.id === id2);
    if (row === void 0 || typeof row.apiKeyRef !== "string") return;
    const value = typeof drafts[id2] === "string" ? drafts[id2].trim() : "";
    setBusy(id2);
    setNotices((previous) => ({ ...previous, [id2]: null }));
    saveCredential(row.apiKeyRef, value).then((answer) => {
      setDrafts((previous) => ({ ...previous, [id2]: "" }));
      setNotices((previous) => ({
        ...previous,
        [id2]: { kind: "ok", text: answer?.unchanged === true ? t("card.keyUnchanged") : t("card.keySaved") }
      }));
      return getState().then(apply2).catch(() => {
      });
    }).catch((error) => setNotices((previous) => ({
      ...previous,
      [id2]: { kind: "error", text: t("card.error").replace("{0}", messageOf(error)) }
    }))).finally(() => setBusy(null));
  };
  const onToggle = (id2, enabled) => {
    setBusy(id2);
    setNotices((previous) => ({ ...previous, [id2]: null }));
    saveEnabled(id2, enabled).then((answer) => {
      const registered = answer?.registered !== false;
      const reason = typeof answer?.reason === "string" && answer.reason !== "" ? answer.reason : null;
      say(id2, "ok", enabled ? registered ? t("card.enabledOn") : notRegisteredText(t, reason) : t("card.enabledOff"));
      return getState().then(apply2).catch(() => {
      });
    }).catch((error) => say(id2, "error", t("card.error").replace("{0}", messageOf(error)))).finally(() => setBusy(null));
  };
  return (0, import_react.createElement)(SpeechGateView, {
    t,
    loading: state.loading,
    providers: state.providers,
    busy,
    drafts,
    notices,
    error: state.error,
    onChange: (id2, value) => setDrafts((previous) => ({ ...previous, [id2]: value })),
    onSave,
    onToggle
  });
}
function SpeechGateIcon(props) {
  const size = typeof props?.size === "number" && props.size > 0 ? props.size : 16;
  return (0, import_react.createElement)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true"
    },
    (0, import_react.createElement)("rect", { x: 6, y: 2, width: 4, height: 7, rx: 2 }),
    (0, import_react.createElement)("path", { d: "M3.5 7.5a4.5 4.5 0 0 0 9 0" }),
    (0, import_react.createElement)("path", { d: "M8 12v2" })
  );
}

// src/client/index.js
var id = "dsh-speech-gate";
var inject = ["slots", "locale"];
var SECTION_ID = "speech-gate";
var SECTION_ORDER = 40;
function safeMount(ctx, label, run) {
  try {
    run();
    return true;
  } catch (error) {
    console.warn(`[dsh-speech-gate] ${label} \u043D\u0435 \u0441\u043C\u043E\u043D\u0442\u0438\u0440\u043E\u0432\u0430\u043D: ${error?.message ?? error}`);
    return false;
  }
}
function apply(ctx) {
  let t = (key) => key;
  try {
    t = ctx.locale.bind(NS);
  } catch (error) {
    console.warn(`[dsh-speech-gate] locale \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430, \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E \u043A\u043B\u044E\u0447\u0438: ${error?.message ?? error}`);
  }
  safeMount(ctx, "dictionaries", () => {
    ctx.effect(() => {
      ctx.locale.register(NS, "en", DICTIONARIES.en);
      ctx.locale.register(NS, "zh", DICTIONARIES.zh);
      return () => {
      };
    }, "dsh-speech-gate: dictionaries");
  });
  safeMount(ctx, "ru language", () => {
    ctx.effect(() => {
      try {
        return ctx.locale.addLanguage({ id: "ru", label: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", fallback: "en" });
      } catch (error) {
        if (!/already/i.test(String(error?.message ?? error))) throw error;
        return () => {
        };
      }
    }, "dsh-speech-gate: ru language");
  });
  safeMount(ctx, "ru dictionary", () => {
    ctx.effect(() => {
      ctx.locale.register(NS, "ru", DICTIONARIES.ru);
      return () => {
      };
    }, "dsh-speech-gate: ru dictionary");
  });
  safeMount(ctx, "styles", () => ctx.effect(() => mountStyle(), "dsh-speech-gate: styles"));
  safeMount(ctx, "settings.section", () => {
    ctx.slots.inject(
      "settings.section",
      () => ctx.slots.register(
        {
          name: "settings.section",
          id: SECTION_ID,
          order: SECTION_ORDER,
          // Without `locale` the host does not inject `t` and the card draws keys.
          locale: NS,
          label: () => t("nav.title")
        },
        SpeechGatePage
      )
    );
  });
  safeMount(ctx, "settings.section.icon", () => {
    ctx.slots.inject(
      "settings.section.icon",
      () => ctx.slots.register(
        {
          name: "settings.section.icon",
          id: SECTION_ID,
          order: SECTION_ORDER,
          label: () => t("nav.title")
        },
        SpeechGateIcon
      )
    );
  });
}

    return module.exports;
  }
});
