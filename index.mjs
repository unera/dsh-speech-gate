// Configurable speechToText provider for DeepSeek Harness.
//
// One package, two backends, chosen by config:
//
//   api  — any OpenAI-compatible `POST /audio/transcriptions` endpoint. That
//          covers a local whisper server (whisper.cpp, faster-whisper-server,
//          whisper-asr-webservice) and any hosted model from the catalogue.
//   exec — a local command (whisper-cli, faster-whisper, ...) that takes a WAV
//          path and prints the transcript.
//
// The provider registers itself into `ctx.speechToText`
// (@deepseek-ai/dsh-experimental-speech-to-text); it never chooses a language
// on its own and never converts audio — the channel already hands it canonical
// 16 kHz mono PCM16 WAV.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const name = 'dsh-speech-gate';
export const inject = ['speechToText'];

const DEFAULT_LANGUAGES = Object.freeze(['ru', 'en']);
const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const WAV_HEADER_BYTES = 44;

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

// Model families that only one provider serves, so a config can skip `provider`.
const MODEL_FAMILIES = Object.freeze([
  [/^voxtral/i, 'mistral'],
  [/^whisper-large-v3/i, 'groq'],
  [/^whisper/i, 'openai'],
  [/^gpt-4o/i, 'openai'],
  [/^gpt-4/i, 'openai'],
]);

/** Provider ids the Host has configured right now, if the llm service is mounted. */
function hostProviders(ctx) {
  const llm = typeof ctx?.get === 'function' ? ctx.get('llm') : ctx?.llm;
  if (typeof llm?.listProviders !== 'function') return [];
  try {
    return llm.listProviders().map((entry) => entry?.id).filter((id) => typeof id === 'string');
  } catch {
    return [];
  }
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
    return { provider: named, ...known };
  }
  if (candidates.length === 1) return { provider: candidates[0], ...CONFIGURED_PROVIDERS[candidates[0]] };
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
  const base = {
    backend,
    id: requireString(config.id ?? (backend === 'api' ? 'openai-compatible' : 'local-command'), 'id'),
    displayName: typeof config.name === 'string' && config.name.trim()
      ? config.name.trim() : backend === 'api' ? 'OpenAI-compatible speech API' : 'Local speech command',
    location: config.location === 'cloud' || config.location === 'host-local'
      ? config.location : backend === 'api' ? 'cloud' : 'host-local',
    languages,
    language: typeof config.language === 'string' && config.language.trim() ? config.language.trim() : null,
    timeoutMs: Number.isSafeInteger(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 120_000,
  };
  if (configured) {
    const model = requireString(config.model, 'model');
    const provider = typeof config.provider === 'string' && config.provider.trim() ? config.provider.trim() : null;
    const family = provider ?? MODEL_FAMILIES.find(([pattern]) => pattern.test(model))?.[1] ?? null;
    const known = family ? CONFIGURED_PROVIDERS[family] : null;
    return Object.freeze({
      ...base,
      configured: true,
      provider: family,
      baseUrl: config.baseUrl
        ? requireString(config.baseUrl, 'baseUrl').replace(/\/+$/, '')
        : known?.baseUrl ?? null,
      model,
      apiKeyRef: typeof config.apiKeyRef === 'string' && config.apiKeyRef.trim()
        ? config.apiKeyRef.trim() : known?.apiKeyRef ?? null,
      apiKeyEnv: typeof config.apiKeyEnv === 'string' && config.apiKeyEnv.trim() ? config.apiKeyEnv.trim() : null,
      apiKeyFile: typeof config.apiKeyFile === 'string' && config.apiKeyFile.trim() ? config.apiKeyFile.trim() : null,
      extraFields: config.extraFields && typeof config.extraFields === 'object' ? { ...config.extraFields } : {},
    });
  }
  if (backend === 'api') {
    return Object.freeze({
      ...base,
      baseUrl: requireString(config.baseUrl ?? 'https://api.openai.com/v1', 'baseUrl').replace(/\/+$/, ''),
      model: requireString(config.model ?? 'whisper-1', 'model'),
      apiKeyRef: typeof config.apiKeyRef === 'string' && config.apiKeyRef.trim() ? config.apiKeyRef.trim() : null,
      apiKeyEnv: typeof config.apiKeyEnv === 'string' && config.apiKeyEnv.trim() ? config.apiKeyEnv.trim() : null,
      apiKeyFile: typeof config.apiKeyFile === 'string' && config.apiKeyFile.trim() ? config.apiKeyFile.trim() : null,
      extraFields: config.extraFields && typeof config.extraFields === 'object' ? { ...config.extraFields } : {},
    });
  }
  const command = requireString(config.command, 'command');
  const args = Array.isArray(config.args) ? config.args.map((entry) => requireString(entry, 'args')) : [];
  return Object.freeze({
    ...base,
    command,
    args: Object.freeze(args),
    stripTimestamps: config.stripTimestamps !== false,
  });
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

/** Read the API key from an explicit env name, a credentials ref, or a file. */
export async function resolveApiKey(options, ctx, { hasCredentials } = {}) {
  if (options.apiKeyEnv) {
    const value = process.env[options.apiKeyEnv];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const credentials = hasCredentials ?? (typeof ctx?.get === 'function' ? ctx.get('credentials') : null);
  if (options.apiKeyRef && typeof credentials?.resolve === 'function') {
    const resolved = await credentials.resolve(options.apiKeyRef);
    const value = typeof resolved?.value === 'string' ? resolved.value.trim() : '';
    if (value) return value;
  }
  if (options.apiKeyFile) {
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
      if (target.backend === 'api' && !apiKey && target.apiKeyRef) {
        throw new Error(
          `speech API key is unavailable (${target.apiKeyRef}); configure the ${target.provider ?? 'matching'} model connector in the Host`,
        );
      }
      const text = target.backend === 'api'
        ? await transcribeViaApi({ ...target, __apiKey: apiKey }, input, signal)
        : await runCommand(target, input, signal);
      return {
        text,
        audioSeconds: wavSeconds(input.audio) ?? 0,
        inferenceSeconds: elapsed(),
      };
    },
  };
}

/** Register every configured recognizer for the lifetime of this plugin. */
export function apply(ctx, config = {}) {
  const { providers } = normalizeConfig(config);
  ctx.effect(() => {
    const unregister = providers.map((options) => ctx.speechToText.register(createProvider(options, ctx)));
    return () => { for (const dispose of unregister) void dispose(); };
  });
}

export default Object.freeze({ name, inject, apply });
