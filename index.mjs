// Configurable speechToText provider for DeepSeek Harness.
//
// One package, three ways to recognize speech, chosen by config:
//
//   api  — any OpenAI-compatible `POST /audio/transcriptions` endpoint. That
//          covers a local whisper server (whisper.cpp, faster-whisper-server,
//          whisper-asr-webservice) and any hosted model from the catalogue.
//   exec — a local command (whisper-cli, faster-whisper, ...) that takes a WAV
//          path and prints the transcript.
//   Yandex SpeechKit — `provider: yandex`, its own endpoint and JSON shape;
//          it is not OpenAI-compatible, so it needs a branch of its own.
//
// The provider registers itself into `ctx.speechToText`
// (@deepseek-ai/dsh-experimental-speech-to-text); it never chooses a language
// on its own and never converts audio — the channel already hands it canonical
// 16 kHz mono PCM16 WAV.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Schema from '@deepseek-ai/schemastery';

import { CREDENTIAL_REF_PATTERN, mountRoutes, readService } from './routes.mjs';

export const name = 'dsh-speech-gate';
export const inject = ['speechToText'];

/**
 * The live fields of this plugin's profile entry.
 *
 * The settings service accepts a write only against a field its Config marks
 * volatile — everything else is ordinary composition, changed by remounting the
 * plugin. `apiKeyRefs` is the one such field: the generated credential names
 * (`provider id → name in the store`) are written back the first time a record
 * needs one, so a name does not change between runs.
 *
 * Every other config field passes through untouched: schemastery keeps keys it was
 * not told about, which is what lets the flat and the `providers:` shapes of this
 * plugin keep working unchanged.
 */
export const Config = Schema.object({
  apiKeyRefs: Schema.dict(Schema.string()).default({}).volatile()
    .description('Сгенерированные имена ключей: id записи → имя в хранилище учётных данных'),
  // The card's «включён» switch. The record itself carries `enabled` as its
  // declared default, but the settings service writes only volatile fields, and a
  // record lives inside the non-volatile `providers` array — so the switch keeps
  // its answer here, next to the names, and this map wins over the record.
  enabledById: Schema.dict(Schema.boolean()).default({}).volatile()
    .description('Переключатели «включён», записанные карточкой: id записи → true/false'),
});

const DEFAULT_LANGUAGES = Object.freeze(['ru', 'en']);
const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const WAV_HEADER_BYTES = 44;

/**
 * How long after mounting the roster is asked again.
 *
 * The credentials service registers itself only once it has read its document,
 * so a record registered on "not known yet" has to be re-asked; the inject seam
 * catches the normal case, this pause covers a Host where that event is not
 * visible to this plugin.
 */
export const RECHECK_DELAY_MS = 1_500;

export const YANDEX_STT_ENDPOINT = 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize';

// SpeechKit accepts only the region-qualified codes below; a bare `ru`/`en` from
// the Host is not one of them. `kk` maps to `kk-KZ`, not `kk-KK` — that is what
// the service documents.
const YANDEX_DEFAULT_LANGUAGE = 'ru-RU';
const YANDEX_LANGUAGES = Object.freeze({
  ru: 'ru-RU',
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  fi: 'fi-FI',
  fr: 'fr-FR',
  he: 'he-IL',
  it: 'it-IT',
  kk: 'kk-KZ',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-PT',
  sv: 'sv-SE',
  tr: 'tr-TR',
  uz: 'uz-UZ',
});

function invalid(message) {
  const error = new TypeError(message);
  error.code = 'speech-provider-invalid';
  return error;
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${field} must be a non-empty string`);
  return value.trim();
}

function stringList(value, field) {
  if (value === undefined) return DEFAULT_LANGUAGES;
  if (!Array.isArray(value) || value.length === 0) throw invalid(`${field} must be a non-empty array`);
  return Object.freeze(value.map((entry) => requireString(entry, field)));
}

// Hosts whose model connector already stores the secret this recognizer needs.
// The Host exposes only provider ids (`llm.listProviders()`), never endpoints or
// credential names, so the mapping lives here and grows one line per provider.
const CONFIGURED_PROVIDERS = Object.freeze({
  openai: { baseUrl: 'https://api.openai.com/v1', apiKeyRef: 'OPENAI_API_KEY' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', apiKeyRef: 'MISTRAL_API_KEY' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', apiKeyRef: 'GROQ_API_KEY' },
});

// SpeechKit is not an LLM connector: its key lives in the credentials store, and
// `llm.listProviders()` has nothing to say about it. Its name is *not* fixed here:
// a recognizer that owns its key gets a name derived from its own id, so two
// recognizers of one account never share a secret by accident. A record that
// spells the name out (`apiKeyRef: YANDEX_SPEECHKIT_API_KEY`, as the synthesis
// plugin uses) keeps exactly that name — there is a working key under it.
export const STT_KEY_PREFIX = 'STT_KEY_';

/** The longest credential name the store accepts. */
const CREDENTIAL_REF_MAX = 64;

/**
 * The credential name a record would carry if it were made from this id.
 *
 * `yandex-stt` becomes `STT_KEY_YANDEX_STT`. The derivation exists so a name is
 * predictable and unique per record; the result is written into the profile the
 * first time (see `apply`) and read back from there afterwards.
 * @param id - the record id.
 * @returns a credential name, or an empty string for an empty id.
 */
export function apiKeyRefFor(id) {
  const name = String(id ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (name === '') return '';
  return `${STT_KEY_PREFIX}${name}`.slice(0, CREDENTIAL_REF_MAX);
}

/**
 * Whether an endpoint names this machine.
 *
 * A recognizer on `127.0.0.1` or `localhost` is a whisper.cpp / faster-whisper
 * server next door: it wants no key, so such a record gets no credential name, no
 * key field and no "no key yet" state — only a line saying the key is not needed.
 * @param value - an endpoint URL, or a bare host.
 * @returns true for a loopback host.
 */
export function isLocalEndpoint(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  let host = '';
  try {
    host = new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}

// Model families that only one provider serves, so a config can skip `provider`.
const MODEL_FAMILIES = Object.freeze([
  [/^voxtral/i, 'mistral'],
  [/^whisper-large-v3/i, 'groq'],
  [/^whisper/i, 'openai'],
  [/^gpt-4o/i, 'openai'],
  [/^gpt-4/i, 'openai'],
]);

/**
 * Provider ids the Host has configured right now.
 *
 * `null` means nobody could be asked — the `llm` service is not mounted, or it
 * refuses to answer — which is not the same as "no provider is configured".
 * @param ctx - plugin context.
 * @returns the ids, or null when the Host answered nothing.
 */
function hostProviderIds(ctx) {
  let llm = null;
  try {
    llm = typeof ctx?.get === 'function' ? ctx.get('llm') : ctx?.llm ?? null;
  } catch {
    return null;
  }
  if (typeof llm?.listProviders !== 'function') return null;
  try {
    return llm.listProviders().map((entry) => entry?.id).filter((id) => typeof id === 'string');
  } catch {
    return null;
  }
}

/** The same ids, with "nobody answered" flattened to an empty list. */
function hostProviders(ctx) {
  return hostProviderIds(ctx) ?? [];
}

/**
 * Whether the model connector a `configured-model` record transcribes through is
 * really there.
 *
 * `llm.listProviders()` is the only answer the Host gives about its connectors. A
 * record whose provider is missing from it cannot transcribe at all: its endpoint
 * and its key come from that connector, and the first call would fail with
 * «provider "X" has no model connector configured». So it is not offered
 * (`absent`) instead of being registered and failing under the person's finger.
 *
 * A Host that answered nothing — no `llm` service, or one that threw — leaves the
 * question open (`unknown`), and an open question is not a "no": the record stays,
 * exactly like a record whose key nobody could ask about yet.
 * @param provider - one normalized provider with `configured: true`.
 * @param ctx - plugin context, for `llm`.
 * @returns `present`, `absent` or `unknown`.
 */
export function connectorState(provider, ctx) {
  const ids = hostProviderIds(ctx);
  if (ids === null) return 'unknown';
  const known = ids.filter((id) => Object.hasOwn(CONFIGURED_PROVIDERS, id));
  // `normalizeProvider()` already resolved the named service from `provider` or
  // from the model family, so this is the same answer the transcription would get.
  const named = typeof provider?.provider === 'string' && provider.provider !== '' ? provider.provider : null;
  if (named !== null) return known.includes(named) ? 'present' : 'absent';
  // No family in the name: the Host's own connectors are the candidates, and only
  // one of them leaves nothing to guess. Two or more still have their explicit
  // "cannot tell which provider" message at use, so they are not skipped here.
  if (known.length === 0) return 'absent';
  return known.length === 1 ? 'present' : 'unknown';
}

/**
 * Pick the provider a `configured-model` entry talks to.
 *
 * Order: explicit `provider`, then the model family, then the only configured
 * provider. Anything else fails loudly with the candidates, because guessing a
 * credential here would silently transcribe through the wrong account.
 */
export function resolveConfiguredProvider(options, ctx) {
  const configured = hostProviders(ctx);
  const candidates = configured.length > 0
    ? configured.filter((id) => CONFIGURED_PROVIDERS[id])
    : Object.keys(CONFIGURED_PROVIDERS);
  const named = options.provider
    ? requireString(options.provider, 'provider')
    : MODEL_FAMILIES.find(([pattern]) => pattern.test(options.model))?.[1];
  if (named) {
    const known = CONFIGURED_PROVIDERS[named];
    if (!known) {
      throw invalid(`unknown provider "${named}"; supported: ${Object.keys(CONFIGURED_PROVIDERS).join(', ')}`);
    }
    if (configured.length > 0 && !configured.includes(named)) {
      throw invalid(`provider "${named}" has no model connector configured in this Host (available: ${configured.join(', ')})`);
    }
    return { provider: named, baseUrl: known.baseUrl, connectorApiKeyRef: known.apiKeyRef };
  }
  if (candidates.length === 1) {
    const known = CONFIGURED_PROVIDERS[candidates[0]];
    return { provider: candidates[0], baseUrl: known.baseUrl, connectorApiKeyRef: known.apiKeyRef };
  }
  throw invalid(`cannot tell which provider serves model "${options.model}"; set provider to one of: ${candidates.join(', ') || 'openai, mistral, groq'}`);
}

/**
 * Validate plugin config once, so a bad entry fails at load time.
 *
 * `providers: [...]` registers several recognizers at once — the Host picker
 * then offers them as a choice; a flat config registers exactly one.
 */
export function normalizeConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw invalid('config must be an object');
  if (config.providers !== undefined) {
    if (!Array.isArray(config.providers) || config.providers.length === 0) {
      throw invalid('providers must be a non-empty array');
    }
    const providers = config.providers.map((entry) => normalizeProvider(entry));
    const ids = new Set(providers.map((entry) => entry.id));
    if (ids.size !== providers.length) throw invalid('provider ids must be unique');
    return Object.freeze({ providers: Object.freeze(providers) });
  }
  return Object.freeze({ providers: Object.freeze([normalizeProvider(config)]) });
}

/**
 * The credential name the config itself spelled out, if any.
 *
 * An explicit name is never replaced: it may already point at a working secret
 * shared with another plugin (the synthesizer's SpeechKit key). Generation is for
 * the records that say nothing.
 * @param config - one provider config.
 * @returns the trimmed name, or null.
 */
const explicitApiKeyRef = (config) => (typeof config.apiKeyRef === 'string' && config.apiKeyRef.trim()
  ? config.apiKeyRef.trim()
  : null);

function normalizeProvider(input = {}) {
  // `configured-model` reuses the model connector the user configured in the
  // Host: the entry names a transcription model, and the endpoint plus the
  // credential come from that connector. `configured-openai-model` is the
  // earlier, OpenAI-only spelling of the same thing.
  const configured = input.backend === 'configured-model' || input.backend === 'configured-openai-model';
  const config = configured ? { ...input, backend: 'api' } : input;
  const backend = config.backend ?? 'api';
  if (backend !== 'api' && backend !== 'exec') {
    throw invalid('backend must be "api", "exec" or "configured-model"');
  }
  const languages = stringList(config.languages, 'languages');
  // `provider` is the one field that names the upstream service; `yandex`
  // (SpeechKit) is the only one that does not speak the OpenAI transcription
  // protocol, so it gets its own shape.
  const providerName = typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim() : null;
  const base = {
    backend,
    // A disabled record is not registered at all: it is not a choice the Host may
    // offer, and its absence is visible in the card instead of a failure at use.
    enabled: config.enabled !== false,
    id: requireString(
      config.id ?? (providerName === 'yandex' ? 'yandex' : backend === 'api' ? 'openai-compatible' : 'local-command'),
      'id',
    ),
    displayName: typeof config.name === 'string' && config.name.trim()
      ? config.name.trim()
      : providerName === 'yandex' ? 'Yandex SpeechKit' : backend === 'api' ? 'OpenAI-compatible speech API' : 'Local speech command',
    location: config.location === 'cloud' || config.location === 'host-local'
      ? config.location : backend === 'api' ? 'cloud' : 'host-local',
    languages,
    language: typeof config.language === 'string' && config.language.trim() ? config.language.trim() : null,
    timeoutMs: Number.isSafeInteger(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 120_000,
  };
  if (backend === 'api' && providerName === 'yandex') {
    return Object.freeze({
      ...base,
      provider: 'yandex',
      // SpeechKit v1 takes raw PCM on its own endpoint and answers with its own
      // JSON; there is no model to name and no OpenAI `baseUrl` to point at.
      endpoint: YANDEX_STT_ENDPOINT,
      baseUrl: null,
      model: null,
      // A cloud service, whatever else the record says: a key is always needed.
      local: false,
      // The name comes from the config, or is generated later from this record's
      // own id: every record owns its secret name, and the synthesizer's
      // SpeechKit key is a different record, not a default.
      apiKeyRef: explicitApiKeyRef(config),
      // SpeechKit is not a model connector, so there is nothing to fall back to.
      connectorApiKeyRef: null,
      // SpeechKit cannot transcribe without a key at all, so a missing one is an
      // error worth naming rather than a request that fails with 401 upstream.
      keyRequired: true,
      apiKeyEnv: typeof config.apiKeyEnv === 'string' && config.apiKeyEnv.trim() ? config.apiKeyEnv.trim() : null,
      apiKeyFile: typeof config.apiKeyFile === 'string' && config.apiKeyFile.trim() ? config.apiKeyFile.trim() : null,
    });
  }
  if (configured) {
    const model = requireString(config.model, 'model');
    const family = providerName ?? MODEL_FAMILIES.find(([pattern]) => pattern.test(model))?.[1] ?? null;
    const known = family ? CONFIGURED_PROVIDERS[family] : null;
    return Object.freeze({
      ...base,
      configured: true,
      // A model connector is a cloud service: the key always comes from somewhere.
      local: false,
      provider: family,
      baseUrl: config.baseUrl
        ? requireString(config.baseUrl, 'baseUrl').replace(/\/+$/, '')
        : known?.baseUrl ?? null,
      model,
      // The record has a name of its own, like every other record: the value typed
      // into our card is what it uses. The connector's credential is the fallback,
      // so a record nobody typed a key for keeps working through the model
      // settings exactly as before.
      apiKeyRef: explicitApiKeyRef(config),
      connectorApiKeyRef: known?.apiKeyRef ?? null,
      keyRequired: true,
      apiKeyEnv: typeof config.apiKeyEnv === 'string' && config.apiKeyEnv.trim() ? config.apiKeyEnv.trim() : null,
      apiKeyFile: typeof config.apiKeyFile === 'string' && config.apiKeyFile.trim() ? config.apiKeyFile.trim() : null,
      extraFields: config.extraFields && typeof config.extraFields === 'object' ? { ...config.extraFields } : {},
    });
  }
  if (backend === 'api') {
    const baseUrl = requireString(config.baseUrl ?? 'https://api.openai.com/v1', 'baseUrl').replace(/\/+$/, '');
    const spelled = explicitApiKeyRef(config);
    // A whisper server on this machine takes no key: such a record is local, so it
    // gets no credential name and the card offers no key field. A record that
    // spells a name out is left alone — the config said it wants a key, and the
    // person may be fronting a loopback server with a token.
    const local = spelled === null && (config.location === 'host-local' || isLocalEndpoint(baseUrl));
    return Object.freeze({
      ...base,
      // Where the recognizer runs is a fact about the endpoint, not about the
      // backend: a loopback API record is host-local even if the config forgot it.
      location: local ? 'host-local' : base.location,
      local,
      baseUrl,
      model: requireString(config.model ?? 'whisper-1', 'model'),
      // An endpoint this record owns: its key name is generated from the id when
      // the config says nothing. A missing value is not an error — a whisper
      // server next door wants no key at all — so it stays optional unless the
      // config named one itself.
      apiKeyRef: spelled,
      connectorApiKeyRef: null,
      keyRequired: spelled !== null,
      apiKeyEnv: typeof config.apiKeyEnv === 'string' && config.apiKeyEnv.trim() ? config.apiKeyEnv.trim() : null,
      apiKeyFile: typeof config.apiKeyFile === 'string' && config.apiKeyFile.trim() ? config.apiKeyFile.trim() : null,
      extraFields: config.extraFields && typeof config.extraFields === 'object' ? { ...config.extraFields } : {},
    });
  }
  const command = requireString(config.command, 'command');
  const args = Array.isArray(config.args) ? config.args.map((entry) => requireString(entry, 'args')) : [];
  return Object.freeze({
    ...base,
    // A command runs on this machine and takes no key at all.
    local: true,
    command,
    args: Object.freeze(args),
    stripTimestamps: config.stripTimestamps !== false,
    apiKeyRef: null,
    connectorApiKeyRef: null,
    keyRequired: false,
  });
}

/**
 * A name no other record uses: the base, or the base with `_2`, `_3`, … on it.
 *
 * Two ids can flatten to one name — `yandex-stt` and `yandex.stt` both become
 * `STT_KEY_YANDEX_STT` — and the store has one value per name. The suffix keeps
 * them apart; the count is dropped from the stem, never truncated away.
 * @param base - the name derived from the id.
 * @param taken - names already spoken for.
 * @returns a free name, or an empty string when the id had nothing to derive from.
 */
function uniqueRef(base, taken) {
  if (base === '') return '';
  let candidate = base;
  for (let number = 2; taken.has(candidate); number += 1) {
    const suffix = `_${number}`;
    candidate = `${base.slice(0, CREDENTIAL_REF_MAX - suffix.length)}${suffix}`;
  }
  return candidate;
}

/**
 * Give every record that owns a secret the credential name it works with.
 *
 * Every record that talks to a speech API owns its secret name: one that does not
 * spell the name out gets one derived from its id — remembered from the profile
 * when it is there, generated and reported in `added` when it is not, so the
 * caller can write it back. That includes a `configured-model` record, which also
 * has the connector's credential as a fallback: two places a person controls
 * separately, at the price of a duplicated secret on purpose.
 *
 * A local recognizer — the `exec` backend, or an API record whose endpoint is
 * this machine — takes no key and comes back untouched: it is not a name to
 * generate, and the card draws a line saying so instead of a key field.
 *
 * An explicit `apiKeyRef` is never replaced, whatever the record is: there may be
 * a working secret under it already.
 * @param providers - `normalizeConfig(...).providers`.
 * @param stored - the `apiKeyRefs` map from the profile entry.
 * @returns `{ providers, added }`, `added` mapping id → the name just made.
 */
export function assignApiKeyRefs(providers, stored = {}) {
  const known = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const list = Array.isArray(providers) ? providers : [];
  const taken = new Set(list.map((provider) => provider?.apiKeyRef).filter((ref) => typeof ref === 'string' && ref !== ''));
  const added = {};
  const next = list.map((provider) => {
    if (provider?.backend !== 'api' || provider?.apiKeyRef !== null || provider?.local === true) return provider;
    const remembered = typeof known[provider.id] === 'string' && CREDENTIAL_REF_PATTERN.test(known[provider.id])
      ? known[provider.id]
      : null;
    const ref = remembered ?? uniqueRef(apiKeyRefFor(provider.id), taken);
    taken.add(ref);
    if (remembered === null) added[provider.id] = ref;
    return Object.freeze({ ...provider, apiKeyRef: ref });
  });
  return { providers: Object.freeze(next), added };
}

/**
 * Write one volatile map into this plugin's own profile entry.
 *
 * The settings service is the only writer of a profile row, and it accepts the
 * write only for a field its Config marks volatile — `apiKeyRefs` and
 * `enabledById` are those fields.
 * @param ctx - plugin context.
 * @param patch - the volatile fields to merge.
 * @returns whether the patch reached the profile.
 */
async function persistVolatile(ctx, patch) {
  const settings = readService(ctx, 'settings');
  if (typeof settings?.update !== 'function') return false;
  const entryId = ctx?.fiber?.entry?.options?.id;
  if (typeof entryId !== 'string' || entryId === '') return false;
  await settings.update(entryId, patch);
  return true;
}

/**
 * Write the generated names into this plugin's own profile entry.
 * @param ctx - plugin context.
 * @param refs - the whole id → name map to keep.
 * @returns whether the map reached the profile.
 */
export async function persistApiKeyRefs(ctx, refs) {
  return persistVolatile(ctx, { apiKeyRefs: { ...refs } });
}

/**
 * Write the card's «включён» answers into this plugin's own profile entry.
 * @param ctx - plugin context.
 * @param enabledById - the whole id → boolean map to keep.
 * @returns whether the map reached the profile.
 */
export async function persistEnabled(ctx, enabledById) {
  return persistVolatile(ctx, { enabledById: { ...enabledById } });
}

/**
 * The records with the card's own switch applied.
 *
 * The record's `enabled` is the default the config declares; a value the card
 * wrote into `enabledById` wins over it, because the person clicked later than the
 * file was written.
 * @param providers - `normalizeConfig(...).providers`, or the same after names.
 * @param stored - the `enabledById` map from the profile entry.
 * @returns the records with `enabled` resolved, the same objects when nothing changed.
 */
export function applyEnabled(providers, stored = {}) {
  const known = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const list = Array.isArray(providers) ? providers : [];
  return Object.freeze(list.map((provider) => {
    if (provider === null || typeof provider !== 'object') return provider;
    const written = known[provider.id];
    const enabled = typeof written === 'boolean' ? written : provider.enabled !== false;
    return enabled === provider.enabled ? provider : Object.freeze({ ...provider, enabled });
  }));
}

/**
 * What the store says about one record's key: `present`, `absent` or `unknown`.
 *
 * `unknown` is not `absent`: it means nobody could be asked — the credentials
 * service has not mounted yet, or the store failed on the way. The distinction is
 * the whole point of the state, because a service that is simply not up yet must
 * never be read as "this record has no key".
 * @param provider - one normalized provider.
 * @param ctx - plugin context, for the environment and file fallbacks.
 * @param store - the credentials service as read right now, or null.
 * @returns `present`, `absent` or `unknown`.
 */
async function keyState(provider, ctx, store) {
  // A record whose name has not been generated yet is asked about the name it
  // would get, so the answer does not depend on when in the lifecycle it is asked.
  const own = typeof provider.apiKeyRef === 'string' && provider.apiKeyRef !== ''
    ? provider.apiKeyRef
    : apiKeyRefFor(provider.id);
  const hasStore = typeof store?.resolve === 'function';
  let value = '';
  try {
    value = await resolveApiKey({ ...provider, apiKeyRef: own }, ctx, { hasCredentials: hasStore ? store : null });
  } catch {
    // A store that throws answered nothing: that is a question left open, not a
    // "no". The record stays, and the provider names the missing key if it is
    // really missing when somebody speaks.
    return 'unknown';
  }
  if (value !== '') return 'present';
  return hasStore ? 'absent' : 'unknown';
}

/**
 * Why one record stands where it stands: the verdict the gate acts on.
 *
 * The reason words are the ones the diagnostic line prints, so "why is it not in
 * the picker" is answerable from one line of the log:
 *
 *   `local`                       — a recognizer on this machine, no key at all;
 *   `key-present`                 — a cloud record with a key it can use;
 *   `credentials-service-missing` — nobody could be asked: the service has not
 *                                   mounted yet, so the record is kept;
 *   `key-unknown`                 — the store was there but refused to answer;
 *   `no-key`                      — the store answered: there is no key, and the
 *                                   recognizer would fail on the first phrase;
 *   `disabled`                    — the person switched it off; never registered;
 *   `no-connector`                — a `configured-model` record whose model
 *                                   connector this Host does not have;
 *   `not-configured`              — a record that cannot transcribe at all;
 *   `disposed`                    — the plugin is going away, so is the roster.
 *
 * A record is registered unless a store positively said it has no key. An absent
 * credentials service means "not known yet", not "no key": the Host mounts that
 * service asynchronously, after the plugins that read it.
 * @param provider - one normalized provider.
 * @param ctx - plugin context, for `credentials`.
 * @param deps - `credentials` to bring a store instead of reading it.
 * @returns `{ configured, reason }`.
 */
export async function judgeRecord(provider, ctx, { credentials } = {}) {
  if (provider === null || typeof provider !== 'object') return { configured: false, reason: 'not-configured' };
  // The switch is the person's answer and outranks every guess about a key.
  if (provider.enabled === false) return { configured: false, reason: 'disabled' };
  if (provider.local === true) return { configured: true, reason: 'local' };
  if (provider.backend !== 'api') return { configured: false, reason: 'not-configured' };
  // A `configured-model` record has no endpoint and no key of its own: both come
  // from the Host's model connector, so a record whose connector is not configured
  // there cannot transcribe and must not reach the picker.
  if (provider.configured === true && connectorState(provider, ctx) === 'absent') {
    return { configured: false, reason: 'no-connector' };
  }
  const store = credentials !== undefined ? credentials : readService(ctx, 'credentials');
  const state = await keyState(provider, ctx, store);
  if (state === 'present') return { configured: true, reason: 'key-present' };
  if (state === 'absent') return { configured: false, reason: 'no-key' };
  return { configured: true, reason: typeof store?.resolve === 'function' ? 'key-unknown' : 'credentials-service-missing' };
}

/**
 * Whether a record can actually transcribe.
 *
 * A local recognizer always can — it needs no key. A remote one can only when a
 * key is there: its own, the model connector's, an environment variable or a
 * file. This is the rule the Host's picker follows: a recognizer nobody configured
 * is not offered at all, so a person cannot choose something that cannot work —
 * but an unanswered question is not "not configured": only a store that said "no
 * key" withdraws a record.
 * @param provider - one normalized provider.
 * @param ctx - plugin context, for `credentials`.
 * @param deps - `credentials` to bring a store instead of reading it.
 * @returns true when the record has everything it needs.
 */
export async function isConfigured(provider, ctx, { credentials } = {}) {
  const judged = await judgeRecord(provider, ctx, { credentials });
  return judged.configured;
}

/**
 * One log line saying where every record of the roster stands.
 *
 * This is the answer to "the picker lost a recognizer": each entry carries the
 * switch, whether it runs here and the reason word from `judgeRecord`, so a
 * record skipped for a key that is really missing reads differently from one
 * skipped because the store had not mounted yet.
 * @param rows - `gate.report()`.
 * @returns the line, without a trailing newline.
 */
export function rosterLine(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return 'распознаватели: в конфиге нет ни одной записи';
  const entries = list.map((row) => `${row?.id}(enabled=${row?.enabled === true}, local=${row?.local === true}, `
    + `registered=${row?.registered === true}) → ${row?.reason}`);
  return `распознаватели: ${entries.join('; ')}`;
}

/**
 * The live registration of the recognizers the Host may offer.
 *
 * A provider is registered only when it is both enabled and configured, and the
 * two answers can change while the Host runs: the card's switch flips `enabled`,
 * a saved key makes a record configured. Withdrawing one is the disposer
 * `speechToText.register()` returned — no restart, no remount.
 * @param ctx - plugin context.
 * @param options - `warn`, `credentials` (a store or a getter, read at use time),
 *   `persist` (writes the switch into the profile, returns whether it landed).
 * @returns the gate.
 */
export function createProviderGate(ctx, options = {}) {
  const warn = typeof options.warn === 'function' ? options.warn : () => {};
  const credentialsOf = typeof options.credentials === 'function'
    ? options.credentials
    : () => options.credentials ?? readService(ctx, 'credentials');
  const persist = typeof options.persist === 'function' ? options.persist : async () => false;
  /** id → the record as the card's switch leaves it. */
  const records = new Map();
  /** id → the disposer `register()` answered with. */
  const active = new Map();
  /** id → the reason word of the last settle, for the diagnostic line. */
  const reasons = new Map();
  /** id → the settle running (or waiting) for it, so two refreshes cannot both register. */
  const settling = new Map();
  let overrides = {};
  let disposed = false;

  const registry = () => {
    try {
      return ctx?.speechToText ?? null;
    } catch {
      return null;
    }
  };

  /** The current verdict on one record, read with the store as it is right now. */
  const judge = (provider) => judgeRecord(provider, ctx, { credentials: credentialsOf() });

  async function withdraw(id) {
    const entry = active.get(id);
    if (entry === undefined) return false;
    active.delete(id);
    try {
      await entry.dispose();
    } catch (error) {
      warn(`распознаватель ${id} не снят: ${error?.message ?? error}`);
    }
    return true;
  }

  async function admit(provider) {
    const service = registry();
    if (service === null || typeof service.register !== 'function') return false;
    try {
      active.set(provider.id, { dispose: service.register(createProvider(provider, ctx)) });
      return true;
    } catch (error) {
      // A registry that refuses one record is not a reason to lose the rest of
      // the roster: the failure is named and the record stays unregistered.
      warn(`распознаватель ${provider.id} не зарегистрирован: ${error?.message ?? error}`);
      return false;
    }
  }

  /**
   * Bring one record in line with its own answers, one settle per id at a time.
   *
   * Two settles for one id can overlap — a saved key and the periodic re-check are
   * a normal pair — and both would see the record unregistered before either wrote
   * `active`, register it twice and lose the first disposer. So a second settle
   * waits for the first and reads the record again when its turn comes: the last
   * word belongs to `records`, never to a record captured before the wait.
   * @param provider - the record to settle.
   * @returns `registered`, `unregistered` or `unchanged`.
   */
  function settle(provider) {
    const id = provider.id;
    const running = settling.get(id);
    const run = (running === undefined ? Promise.resolve() : running.catch(() => {}))
      .then(() => settleNow(records.get(id) ?? provider));
    settling.set(id, run);
    // Whoever takes the entry over owns it: a late finish must not drop the queue.
    const done = () => { if (settling.get(id) === run) settling.delete(id); };
    run.then(done, done);
    return run;
  }

  /** One settle, against the record the gate holds right now. */
  async function settleNow(provider) {
    const was = active.has(provider.id);
    const verdict = disposed ? { configured: false, reason: 'disposed' } : await judge(provider);
    reasons.set(provider.id, verdict.reason);
    const wanted = verdict.configured;
    if (wanted && !was) {
      return (await admit(provider)) ? 'registered' : 'unchanged';
    }
    if (!wanted && was) {
      await withdraw(provider.id);
      return 'unregistered';
    }
    return 'unchanged';
  }

  const usable = (id) => {
    const provider = records.get(id);
    return provider === undefined ? null : provider;
  };

  return {
    /**
     * Take the configured records and settle every one of them.
     * @param providers - normalized providers, names already assigned.
     * @param storedEnabled - the `enabledById` map from the profile entry.
     * @returns the list with `enabled` resolved.
     */
    async load(providers, storedEnabled = {}) {
      overrides = storedEnabled !== null && typeof storedEnabled === 'object' && !Array.isArray(storedEnabled)
        ? { ...storedEnabled }
        : {};
      const list = applyEnabled(providers, overrides);
      for (const provider of list) records.set(provider.id, provider);
      for (const provider of list) await settle(provider);
      return list;
    },
    /**
     * Re-settle one record — after a key was saved under its name, say.
     * @param id - the record id.
     * @returns the outcome, or null for an unknown id.
     */
    async refresh(id) {
      const provider = usable(id);
      return provider === null ? null : settle(provider);
    },
    /** Re-settle every record: a key was written and any of them may now work. */
    async refreshAll() {
      for (const provider of records.values()) await settle(provider);
    },
    /**
     * Flip the card's switch: the live registration follows immediately, and the
     * answer is written into the profile so it survives a restart.
     * @param id - the record id.
     * @param enabled - the new state.
     * @returns `{ enabled, outcome, registered, saved }`, or null for an unknown id.
     */
    async setEnabled(id, enabled) {
      const provider = usable(id);
      if (provider === null || typeof enabled !== 'boolean') return null;
      const next = Object.freeze({ ...provider, enabled });
      records.set(id, next);
      overrides = { ...overrides, [id]: enabled };
      const outcome = await settle(next);
      let saved = false;
      try {
        saved = (await persist({ ...overrides })) === true;
      } catch (error) {
        warn(`переключатель ${id} не записан в профиль: ${error?.message ?? error}`);
      }
      if (!saved) {
        warn(`переключатель ${id}: значение не легло в профиль — до перезапуска оно живёт только в памяти`);
      }
      return { enabled, outcome, registered: active.has(id), reason: reasons.get(id) ?? null, saved };
    },
    /** Whether this record has a live registration right now. */
    isRegistered: (id) => active.has(id),
    /** The reason word of this record's last settle, or null when it never settled. */
    reasonOf: (id) => reasons.get(id) ?? null,
    /**
     * The roster as diagnostics: one row per record, with the reason word of the
     * last settle. It is what `rosterLine()` turns into a log line.
     * @returns `[{ id, enabled, local, reason, registered }]`, in configuration order.
     */
    report() {
      const rows = [];
      for (const record of records.values()) {
        rows.push({
          id: record.id,
          enabled: record.enabled !== false,
          local: record.local === true,
          reason: reasons.get(record.id) ?? 'unsettled',
          registered: active.has(record.id),
        });
      }
      return rows;
    },
    /** Whether this record has everything it needs, switch aside. */
    async isConfigured(id) {
      const provider = usable(id);
      if (provider === null) return false;
      return (await judge(provider)).configured;
    },
    /** The record as the gate holds it, switch included. */
    record: usable,
    /** Withdraw every registration this gate made. */
    async dispose() {
      disposed = true;
      // A settle already in flight would register a record after the sweep below;
      // waiting for it first keeps the roster empty once this returns.
      await Promise.all([...settling.values()].map((run) => run.catch(() => {})));
      for (const id of [...active.keys()]) await withdraw(id);
    },
  };
}

/** Duration of a canonical PCM16 WAV, or null when the container is not canonical. */
export function wavSeconds(audio) {
  if (!audio || audio.length < WAV_HEADER_BYTES) return null;
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  if (view.getUint32(24, true) !== SAMPLE_RATE || view.getUint16(22, true) !== 1) return null;
  const dataBytes = view.getUint32(40, true);
  if (dataBytes <= 0) return null;
  return dataBytes / (SAMPLE_RATE * BYTES_PER_SAMPLE);
}

/**
 * Read the API key of one record.
 *
 * Order: the record's own credential name, then — for a `configured-model` record —
 * the credential of the Host's model connector, then an explicit environment
 * variable, then a file. The first two are the settings a person makes in the web
 * UI: a key typed into the recognition card belongs to this record and wins over
 * the shared connector secret, which stays the fallback so an untouched record
 * keeps transcribing exactly as before.
 * @param options - one normalized provider.
 * @param ctx - plugin context (`ctx.get('credentials')` is the seam).
 * @param deps - `hasCredentials` to bring a store instead of reading it; `null`
 *   states that there is no store at all, so the seam is not asked a second time.
 * @returns the key, or an empty string when there is none.
 */
export async function resolveApiKey(options, ctx, { hasCredentials } = {}) {
  const credentials = hasCredentials !== undefined
    ? hasCredentials
    : (typeof ctx?.get === 'function' ? ctx.get('credentials') : null);
  const refs = [options?.apiKeyRef, options?.connectorApiKeyRef].filter(
    (ref, index, all) => typeof ref === 'string' && ref !== '' && all.indexOf(ref) === index,
  );
  if (typeof credentials?.resolve === 'function') {
    for (const ref of refs) {
      const resolved = await credentials.resolve(ref);
      const value = typeof resolved?.value === 'string' ? resolved.value.trim() : '';
      if (value) return value;
    }
  }
  if (options?.apiKeyEnv) {
    const value = process.env[options.apiKeyEnv];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (options?.apiKeyFile) {
    try {
      const value = readFileSync(options.apiKeyFile, 'utf8').trim();
      if (value) return value;
    } catch {
      // A missing key file simply leaves the key empty.
    }
  }
  return '';
}

/** Ask an OpenAI-compatible endpoint for a transcript. */
export async function transcribeViaApi(options, input, signal, { fetchImpl = fetch } = {}) {
  const key = options.__apiKey ?? '';
  const form = new FormData();
  form.append('file', new Blob([input.audio], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', options.model);
  form.append('response_format', 'json');
  const language = input.language || options.language;
  if (language) form.append('language', language);
  for (const [fieldName, value] of Object.entries(options.extraFields)) form.append(fieldName, String(value));
  const response = await fetchImpl(`${options.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    body: form,
    signal,
  });
  if (!response.ok) {
    const detail = typeof response.text === 'function' ? (await response.text()).slice(0, 200) : '';
    throw new Error(`speech API HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const body = await response.json();
  return typeof body?.text === 'string' ? body.text.trim() : '';
}

/**
 * SpeechKit language code for a bare locale from the Host (`ru`, `en`, ...).
 *
 * The service accepts region-qualified codes only, so `ru` has to become
 * `ru-RU`. An already qualified code is passed through; anything unknown falls
 * back to the package default, Russian.
 */
export function yandexLanguage(language) {
  if (typeof language !== 'string') return YANDEX_DEFAULT_LANGUAGE;
  const code = language.trim();
  if (!code) return YANDEX_DEFAULT_LANGUAGE;
  const mapped = YANDEX_LANGUAGES[code.toLowerCase()];
  if (mapped) return mapped;
  if (/^[a-z]{2}-[a-z]{2}$/iu.test(code)) {
    return `${code.slice(0, 2).toLowerCase()}-${code.slice(3).toUpperCase()}`;
  }
  return YANDEX_DEFAULT_LANGUAGE;
}

/**
 * PCM payload of a WAV: drop the RIFF container, keep the samples untouched.
 *
 * SpeechKit wants `format=lpcm` — headerless 16 kHz mono PCM16, which is exactly
 * what the channel already puts in the WAV, so slicing the header is enough; no
 * resampling or re-encoding happens. Audio that is not RIFF/WAVE is assumed to
 * be raw PCM already and passes through.
 */
export function wavToPcm(audio) {
  if (!audio || audio.length === 0) return new Uint8Array(0);
  const tag = (offset) => String.fromCharCode(audio[offset], audio[offset + 1], audio[offset + 2], audio[offset + 3]);
  if (audio.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return audio;
  if (audio.length <= WAV_HEADER_BYTES) return new Uint8Array(0);
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  let offset = 12;
  while (offset + 8 <= audio.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') {
      const start = offset + 8;
      return audio.subarray(start, Math.min(audio.length, start + size));
    }
    offset += 8 + size + (size % 2);
  }
  return audio;
}

/** Ask Yandex SpeechKit for a transcript. */
export async function transcribeViaSpeechKit(options, input, signal, { fetchImpl = fetch } = {}) {
  const key = options.__apiKey ?? '';
  const query = new URLSearchParams({
    lang: yandexLanguage(input.language || options.language),
    format: 'lpcm',
    sampleRateHertz: String(SAMPLE_RATE),
  });
  const endpoint = options.endpoint ?? YANDEX_STT_ENDPOINT;
  const response = await fetchImpl(`${endpoint}?${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${key}`,
      'Content-Type': 'application/octet-stream',
    },
    body: wavToPcm(input.audio),
    signal,
  });
  const raw = typeof response.text === 'function' ? await response.text() : '';
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  // SpeechKit reports failures in the body with HTTP 200 now and then, so the
  // error code decides, not the status alone.
  if (!response.ok || body?.error_code !== undefined) {
    const code = body?.error_code ?? `HTTP ${response.status}`;
    const message = body?.error_message ?? (raw ? raw.slice(0, 200) : 'empty response');
    throw new Error(`yandex-stt ${code}: ${message}`);
  }
  return typeof body?.result === 'string' ? body.result.trim() : '';
}

/** Run a local command that prints the transcript. */
export function runCommand(options, input, signal, { spawnImpl = spawn } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-speech-'));
  const inputPath = join(directory, 'audio.wav');
  writeFileSync(inputPath, input.audio);
  const language = input.language || options.language || '';
  const args = options.args.map((entry) => entry
    .replaceAll('{input}', inputPath)
    .replaceAll('{language}', language)
    .replaceAll('{model}', options.model ?? ''));
  return new Promise((resolve, reject) => {
    const child = spawnImpl(options.command, args, { signal });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; if (stderr.length > 2_000) stderr = stderr.slice(-2_000); });
    child.on('error', (error) => {
      rmSync(directory, { recursive: true, force: true });
      reject(error);
    });
    child.on('close', (code) => {
      rmSync(directory, { recursive: true, force: true });
      if (code !== 0) {
        reject(new Error(`speech command exited with code ${code}: ${stderr.slice(-300)}`));
        return;
      }
      resolve(stripOutput(stdout, options.stripTimestamps));
    });
  });
}

const TIMESTAMP_PREFIX = /^\s*\[[\d:.,\s\->]+\]\s*/u;

/** Drop leading `[00:00.000 --> ...]` markers and blank lines from CLI output. */
export function stripOutput(stdout, stripTimestamps = true) {
  const lines = String(stdout ?? '').split('\n');
  const kept = [];
  for (const raw of lines) {
    const line = (stripTimestamps ? raw.replace(TIMESTAMP_PREFIX, '') : raw).trim();
    if (line) kept.push(line);
  }
  return kept.join(' ').trim();
}

function timed() {
  const started = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - started) / 1e9;
}

/** Build one provider object (info + transcribe) for the Host registry. */
export function createProvider(options, ctx) {
  return {
    info: {
      id: options.id,
      name: options.displayName,
      location: options.location,
      languages: options.languages,
    },
    async transcribe(input, signal) {
      const elapsed = timed();
      // A `configured-model` entry resolves its endpoint and credential only
      // here, so adding a model connector in the Host needs no edit to this
      // plugin's config.
      const target = options.configured
        ? { ...options, ...resolveConfiguredProvider(options, ctx) }
        : options;
      const apiKey = target.backend === 'api' ? await resolveApiKey(target, ctx) : '';
      // A name is not a requirement by itself: a generated one is written for the
      // card's sake, and a `backend: api` record may point at a whisper server
      // that wants no key. `keyRequired` is set where the key really is a must.
      if (target.backend === 'api' && !apiKey && target.keyRequired === true) {
        throw new Error(
          `speech API key is unavailable (${target.apiKeyRef}); ${target.provider === 'yandex'
            ? 'add it to the Host credentials store'
            : `configure the ${target.provider ?? 'matching'} model connector in the Host`}`,
        );
      }
      const text = target.backend !== 'api'
        ? await runCommand(target, input, signal)
        : target.provider === 'yandex'
          ? await transcribeViaSpeechKit({ ...target, __apiKey: apiKey }, input, signal)
          : await transcribeViaApi({ ...target, __apiKey: apiKey }, input, signal);
      return {
        text,
        audioSeconds: wavSeconds(input.audio) ?? 0,
        inferenceSeconds: elapsed(),
      };
    },
  };
}

/**
 * Run a callback once the Host has mounted the named services.
 *
 * `ctx.inject()` forks a fiber that waits: the callback runs as soon as every
 * named service is there, and never in a Host that has none of them. That is the
 * seam the roster re-check needs — the credentials service is registered by its
 * own `Service.init` only after it has read the document, so a plugin mounting in
 * parallel sees `null` and has to be told when the answer becomes askable.
 * @param ctx - plugin context.
 * @param services - the service names to wait for.
 * @param callback - what to do once they are all mounted.
 * @returns a disposer, or a no-op when this context cannot inject.
 */
function watchFor(ctx, services, callback) {
  if (typeof ctx?.inject !== 'function') return () => {};
  try {
    const dispose = ctx.inject(services, () => {
      try {
        callback();
      } catch (error) {
        ctx?.logger?.warn?.(`пере-проверка не удалась: ${error?.message ?? error}`);
      }
    });
    return typeof dispose === 'function' ? dispose : () => {};
  } catch {
    return () => {};
  }
}

/**
 * Register every configured, enabled recognizer for the lifetime of this plugin.
 *
 * "Configured" is the whole point of the rule: a recognizer with a key the store
 * says it does not have is not registered, so the Host's picker cannot offer
 * something that would fail on the first attempt. A record whose key nobody could
 * be asked about yet — the credentials service has not mounted — is registered and
 * re-checked, because "not known yet" is not "no key". The card in the web
 * settings talks to the routes mounted here; without them it has nothing to read
 * and nowhere to put a key or a switch.
 */
export function apply(ctx, config = {}) {
  const { providers } = normalizeConfig(config);
  const stored = config?.apiKeyRefs !== null && typeof config?.apiKeyRefs === 'object' && !Array.isArray(config.apiKeyRefs)
    ? config.apiKeyRefs
    : {};
  const storedEnabled = config?.enabledById !== null && typeof config?.enabledById === 'object' && !Array.isArray(config.enabledById)
    ? config.enabledById
    : {};
  // The names travel with the records: the card, the store and `resolveApiKey()`
  // all ask the same object what a secret is called.
  const { providers: keyed, added } = assignApiKeyRefs(providers, stored);
  const warn = typeof ctx?.logger?.warn === 'function'
    ? (message) => ctx.logger.warn(message)
    : (message) => console.warn(`[dsh-speech-gate] ${message}`);
  if (Object.keys(added).length > 0) {
    // Written once, then read back from the profile: a generated name must not
    // change between runs, and a person may edit it there deliberately.
    void persistApiKeyRefs(ctx, { ...stored, ...added })
      .then((saved) => {
        if (saved) return;
        warn(`имена ключей не записаны в профиль (${Object.keys(added).join(', ')}): нет сервиса настроек или записи профиля — имя будет выводиться из id при каждом запуске`);
      })
      .catch((error) => warn(`имена ключей не записаны в профиль: ${error?.message ?? error}`));
  }
  const gate = createProviderGate(ctx, {
    warn,
    // Read at use time: the credentials service mounts after this plugin does.
    credentials: () => readService(ctx, 'credentials'),
    persist: (map) => persistEnabled(ctx, map),
  });
  const log = typeof ctx?.logger?.info === 'function'
    ? (message) => ctx.logger.info(message)
    : (message) => console.info(`[dsh-speech-gate] ${message}`);
  // The diagnostic line is printed when the roster settles, and again only when
  // it really changed: "the picker lost a recognizer" is answered from the log.
  let announced = '';
  const announce = () => {
    const line = rosterLine(gate.report());
    if (line === announced) return;
    announced = line;
    log(line);
  };
  /** Re-ask the store about every record: a registration made on a guess is a guess. */
  const recheck = () => {
    void gate.refreshAll()
      .then(announce)
      .catch((error) => warn(`распознаватели не пере-проверены: ${error?.message ?? error}`));
  };
  ctx.effect(() => {
    // Whether a record is configured is the store's answer, so the roster settles
    // asynchronously — but the effect itself is synchronous, as the Host expects.
    void gate.load(keyed, storedEnabled)
      .then(announce)
      .catch((error) => warn(`распознаватели не зарегистрированы: ${error?.message ?? error}`));
    // The credentials service mounts asynchronously after the plugins that read
    // it (its `Service.init` reads the document first), so the records registered
    // on "not known yet" have to be asked again once it is there — and once more
    // after a short pause, for a Host whose service arrives without a lifecycle
    // event this plugin can see. A record with no key is withdrawn then, so the
    // picker keeps only what can really transcribe.
    const cleanups = [watchFor(ctx, ['credentials'], recheck)];
    const timer = setTimeout(recheck, RECHECK_DELAY_MS);
    timer.unref?.();
    cleanups.push(() => clearTimeout(timer));
    return () => {
      for (const cleanup of cleanups) {
        try { cleanup?.(); } catch { /* already gone */ }
      }
      void gate.dispose();
    };
  });
  mountRoutes(ctx, keyed, { warn, log, gate });
}

export default Object.freeze({ name, inject, Config, apply });
