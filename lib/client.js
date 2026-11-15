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
  "card.note": "The SpeechKit key is one and the same for synthesis and recognition; local recognizers need no key.",
  "card.loading": "Loading recognizers\u2026",
  "card.empty": "No recognizer here takes a key: the plugin config has nothing to set up.",
  "card.key": "API key",
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
  "card.hint": "What to know: "
};
var ru = {
  "nav.title": "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438",
  "card.title": "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438 (speech gate)",
  "card.note": "\u041A\u043B\u044E\u0447 SpeechKit \u043E\u0434\u0438\u043D \u0438 \u0442\u043E\u0442 \u0436\u0435 \u0434\u043B\u044F \u0441\u0438\u043D\u0442\u0435\u0437\u0430 \u0438 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F; \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u043C \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044F\u043C \u043A\u043B\u044E\u0447 \u043D\u0435 \u043D\u0443\u0436\u0435\u043D.",
  "card.loading": "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044E \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u0438\u2026",
  "card.empty": "\u041D\u0438 \u043E\u0434\u043D\u043E\u043C\u0443 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044E \u0437\u0434\u0435\u0441\u044C \u043A\u043B\u044E\u0447 \u043D\u0435 \u043D\u0443\u0436\u0435\u043D: \u0432 \u043A\u043E\u043D\u0444\u0438\u0433\u0435 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u043D\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E.",
  "card.key": "API-\u043A\u043B\u044E\u0447",
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
  "card.hint": "\u0427\u0442\u043E \u0432\u0430\u0436\u043D\u043E \u0437\u043D\u0430\u0442\u044C: "
};
var zh = {
  "nav.title": "\u8BED\u97F3\u8BC6\u522B",
  "card.title": "\u8BED\u97F3\u8BC6\u522B\uFF08speech gate\uFF09",
  "card.note": "SpeechKit \u7684\u5BC6\u94A5\u5728\u8BED\u97F3\u5408\u6210\u4E0E\u8BC6\u522B\u4E4B\u95F4\u662F\u540C\u4E00\u4E2A\uFF1B\u672C\u5730\u8BC6\u522B\u5668\u4E0D\u9700\u8981\u5BC6\u94A5\u3002",
  "card.loading": "\u6B63\u5728\u52A0\u8F7D\u8BC6\u522B\u5668\u2026",
  "card.empty": "\u8FD9\u91CC\u7684\u8BC6\u522B\u5668\u90FD\u4E0D\u9700\u8981\u5BC6\u94A5\uFF1A\u63D2\u4EF6\u914D\u7F6E\u4E2D\u6CA1\u6709\u53EF\u8BBE\u7F6E\u7684\u5185\u5BB9\u3002",
  "card.key": "API \u5BC6\u94A5",
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
  "card.hint": "\u9700\u8981\u6CE8\u610F\uFF1A"
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
.dsg-key-state { font-size: 12px; font-weight: 600; }
.dsg-key-ok { color: #3fb950; font-size: 12px; font-weight: 600; }
.dsg-key-off { color: #d29922; font-size: 12px; font-weight: 600; }
.dsg-key-row { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; min-width: 0; }
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
    keySource: row.keySource === "own" || row.keySource === "connector" ? row.keySource : null
  }));
}
function showsKeyField(row) {
  return typeof row?.apiKeyRef === "string" && row.apiKeyRef !== "";
}
function isYandexProvider(row) {
  return row?.provider === "yandex" || row?.id === "yandex";
}
function keyStateText(t, row) {
  if (row?.keyPresent !== true) return t("card.keyMissing");
  return row.keySource === "connector" ? t("card.keyPresentConnector") : t("card.keyPresent");
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
  const children = [(0, import_react.createElement)("h2", { className: "dsg-title" }, t("card.title"))];
  children.push((0, import_react.createElement)("p", { className: "dsg-note" }, t("card.note")));
  if (props?.loading === true) {
    children.push((0, import_react.createElement)("p", { className: "dsg-note" }, t("card.loading")));
  } else if (providers.length === 0) {
    children.push((0, import_react.createElement)("p", { className: "dsg-note" }, t("card.empty")));
  } else {
    const rows = providers.map((row) => {
      const saving = busy === row.id;
      const notice = notices[row.id] ?? null;
      const fields = [
        (0, import_react.createElement)(
          "div",
          { className: "dsg-provider-head", key: "head" },
          (0, import_react.createElement)("span", { className: "dsg-provider-name" }, row.name),
          (0, import_react.createElement)("code", { className: "dsg-provider-id" }, row.id),
          (0, import_react.createElement)("span", {
            className: row.keyPresent ? "dsg-key-ok dsg-key-state" : "dsg-key-off dsg-key-state",
            "data-key-state": row.keyPresent ? "present" : "missing"
          }, keyStateText(t, row))
        )
      ];
      if (showsKeyField(row)) {
        fields.push(
          (0, import_react.createElement)(
            "div",
            { className: "dsg-key-row", key: "row" },
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
      if (notice !== null) {
        fields.push((0, import_react.createElement)(
          "p",
          { className: notice.kind === "error" ? "dsg-error" : "dsg-ok", key: "notice" },
          notice.text ?? ""
        ));
      }
      return (0, import_react.createElement)("li", {
        key: row.id,
        className: "dsg-provider",
        "data-provider": row.id,
        "data-key-source": row.keySource ?? "none"
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
    if (this.state.error === null) return this.props.children;
    return (0, import_react.createElement)(
      "section",
      { className: "dsg" },
      (0, import_react.createElement)("h2", { className: "dsg-title" }, "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438"),
      (0, import_react.createElement)("p", { className: "dsg-error" }, messageOf(this.state.error))
    );
  }
};
function SpeechGatePage(props) {
  return (0, import_react.createElement)(CardBoundary, null, (0, import_react.createElement)(SpeechGateCard, props));
}
function SpeechGateCard(props) {
  const t = typeof props?.t === "function" ? props.t : (key) => key;
  const [state, setState] = (0, import_react.useState)({ loading: true, providers: [], error: null });
  const [drafts, setDrafts] = (0, import_react.useState)({});
  const [busy, setBusy] = (0, import_react.useState)(null);
  const [notices, setNotices] = (0, import_react.useState)({});
  const apply2 = (snapshot) => setState({ loading: false, providers: providerRows(snapshot), error: null });
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
  return (0, import_react.createElement)(SpeechGateView, {
    t,
    loading: state.loading,
    providers: state.providers,
    busy,
    drafts,
    notices,
    error: state.error,
    onChange: (id2, value) => setDrafts((previous) => ({ ...previous, [id2]: value })),
    onSave
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
