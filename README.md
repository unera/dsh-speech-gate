# dsh-speech-gate

A configurable speech-to-text **provider** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Harness keeps recognizers behind the `speechToText` service
(`@deepseek-ai/dsh-experimental-speech-to-text`): a registry of named providers
that a channel resolves before transcribing. This package registers one or more
of them, so a host can offer a choice between a hosted model, a local whisper
server and a local command without any channel knowing about it.

Three shapes, one package:

| backend | what it does | good for |
| --- | --- | --- |
| `api` | `POST {baseUrl}/audio/transcriptions` (OpenAI-compatible multipart) | hosted models, `whisper.cpp --server`, `faster-whisper-server`, `whisper-asr-webservice` |
| `exec` | runs a command, prints the transcript on stdout | `whisper-cli` or `faster-whisper` on the same machine |
| `configured-model` | same call as `api`, but the endpoint and key come from the model connector the Host already has | a Host whose OpenAI/Mistral model is configured once, without pasting the secret twice |
| `provider: yandex` | `POST https://stt.api.cloud.yandex.net/speech/v1/stt:recognize` with raw PCM and an `Api-Key` header | Yandex SpeechKit, whose key the synthesizer already stores |

The provider never transcodes audio: the channel already hands it canonical
16 kHz mono PCM16 WAV, which is what every `speechToText` provider accepts.

## The settings card (web)

The package ships a browser half — a section of its own in the web settings,
«Распознавание речи (speech gate)», next to the synthesis card. It exists so the
recognizer keys are typed somewhere sane instead of being put into the credentials
store by hand: the card reads the state from the plugin, writes only through the
host's authenticated `/api` channel, and never draws a stored value back.

The header of the card says where the recognizer itself is chosen — «Плагины» →
«Голосовой ввод» → «Сервис распознавания». This card configures the candidates;
that page picks one, and a person who edits the wrong screen concludes the
recognizer is broken.

What the card offers per record:

| record | what is drawn | why |
| --- | --- | --- |
| `provider: yandex`, `configured-model`, plain remote `api` | key field, state, «включён» switch | a key typed here belongs to this record and is used first |
| `backend: exec`, `api` on `127.0.0.1`/`localhost` | «локальный распознаватель, ключ не нужен», switch | such a recognizer wants no key at all |
| a remote record with no key anywhere | grey row, `нет ключа — провайдер не используется`, no switch | it cannot work, so it is not offered to the Host |

The card does not look for a whisper model on disk. For `backend: exec` the model
directory is whatever the binary itself was given, and for a local `api` server the
model lives on that server; a card guessing at either would be a confident line
that is sometimes wrong, so it says only that the key is not needed.

Only a *configured* record — one with a key (its own, the connector's, from
`apiKeyEnv` or `apiKeyFile`) or a local one — and only an *enabled* record is
registered into `speechToText`. A recognizer that would fail on its first attempt
never reaches the picker. The card's «включён» switch writes `enabledById` into
the profile and withdraws or returns the registration at once, through the
disposer `speechToText.register()` answered with — no restart, no remount.

Local records get no credential name at all: `STT_KEY_<ID>` is generated for the
records that can use one.

Every remote API record has its own credential name, `STT_KEY_<ID>` by default
(`yandex-new` → `STT_KEY_YANDEX_NEW`), written into the profile the first time so
it does not change between runs; an `apiKeyRef` spelled out in the profile is
never rewritten. A key resolves in this order:

1. the record's own name (`apiKeyRef`);
2. the Host model connector's credential (`OPENAI_API_KEY`, `MISTRAL_API_KEY`,
   `GROQ_API_KEY`) — for `configured-model` only;
3. `apiKeyEnv`;
4. `apiKeyFile`.

The duplication is deliberate: a person may configure recognition only, synthesis
only or both, and each place stays under their control. Two routes serve the card:

```
GET  /api/speech-gate/state       → { providers: [{ id, name, provider, local, enabled, configured,
                                                    apiKeyRef, connectorRef, keyPresent, keySource }] }
POST /api/speech-gate/credential  → { ref, value } → { ok, ref, present, unchanged? }
POST /api/speech-gate/enabled     → { id, enabled } → { ok, id, enabled, registered, saved }
```

`keySource` is `own` (a value under this record's name), `connector` (the model
settings answer instead) or `null`. `local` marks a recognizer on this machine;
`configured` says whether it has everything it needs, which is exactly the set the
Host is offered. `registered` in the switch answer is what the running service did
with the record, and `saved` is whether that answer also reached the profile —
a Host without the settings service keeps the switch live until it restarts, and
the card says so in the log instead of pretending. An empty value with a stored key is
`{ unchanged: true }` and writes nothing; a value is never returned and never
logged — the log line carries the reference and the fact only.

## Install

Pick whichever source fits the Host. All three install the same package, and
`dsh plugin` records the result in the profile's `package.json`.

**From npm** — a released version, the default choice:

```sh
dsh plugin --profile <profile> add @dr-co/dsh-speech-gate        # latest release
dsh plugin --profile <profile> add @dr-co/dsh-speech-gate@0.1.0  # pinned, reproducible
```

**From GitHub** — no registry involved; useful when you want the current main:

```sh
dsh plugin --profile <profile> add github:unera/dsh-speech-gate            # main branch
dsh plugin --profile <profile> add github:unera/dsh-speech-gate#v0.1.0     # a tag
dsh plugin --profile <profile> add github:unera/dsh-speech-gate#206fb1e    # a commit
```

**From a local checkout** — while developing, `file:` follows your edits
(re-run `add` after changing files, because pnpm copies the directory):

```sh
git clone https://github.com/unera/dsh-speech-gate
dsh plugin --profile <profile> add file:$PWD/dsh-speech-gate
```

The package ships no `dsh.bundle`, so `dsh plugin add` installs it as a plain
dependency and the profile patch below is what actually mounts it — `dsh plugin`
prints a warning saying exactly that.

Then mount it in the profile patch (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`)
next to the service it feeds:

```yaml
- id: speech-to-text
  config:
    defaultProvider: openai-compatible
    language: ru
- insert:
    - id: speech-provider
      name: '@dr-co/dsh-speech-gate'
      config:
        providers:
          - id: openai-compatible
            backend: configured-model
            name: OpenAI gpt-4o-mini-transcribe
            location: cloud
            languages: [ru, en]
            language: ru
            model: gpt-4o-mini-transcribe
          - id: mistral-voxtral
            backend: configured-model
            name: Mistral Voxtral
            location: cloud
            languages: [ru, en]
            language: ru
            model: voxtral-mini-latest
          - id: whisper-local
            backend: api
            name: Local whisper server
            location: host-local
            languages: [ru, en]
            baseUrl: http://127.0.0.1:8080/v1
            model: whisper-1
          - id: whisper-exec
            backend: exec
            name: Local whisper command
            location: host-local
            languages: [ru, en]
            command: whisper-cli
            args: ['-f', '{input}', '-l', '{language}', '-nt']
```

Every entry becomes a selectable provider; with the optional
`@deepseek-ai/dsh-experimental-voice-input-bundle` enabled, that choice (and the
language) appears in the Web UI under *Plugins → Voice Input*. A flat config
(`backend`, `baseUrl`, `model`, …) registers a single provider and is still
supported.

## Reusing the Host model connector (`configured-model`)

Typing the same secret twice is the main friction: the Host already holds an
OpenAI or Mistral key for the chat model. `backend: configured-model` reuses it —
the entry names only the transcription model, and the endpoint plus the
credential name come from the table below:

| provider | endpoint | credential |
| --- | --- | --- |
| `openai` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `mistral` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| `groq` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |

```yaml
- id: openai-transcribe
  backend: configured-model
  model: gpt-4o-transcribe

- id: openai-mini
  backend: configured-model
  model: gpt-4o-mini-transcribe

- id: voxtral
  backend: configured-model
  model: voxtral-mini-latest
```

Resolution runs once per transcription, against the providers the Host reports
through `llm.listProviders()`:

1. an explicit `provider` in the entry;
2. otherwise the model family — `voxtral-*` → mistral, `whisper-large-v3*` →
   groq, `gpt-4o*` / `gpt-4*` / `whisper*` → openai;
3. otherwise, when the Host has exactly one of the known providers configured,
   that one;
4. otherwise the transcription fails with the candidate list. It never guesses:
   the wrong credential would quietly bill the wrong account.

A provider that the model configuration does not include is refused with
"has no model connector configured". `configured-openai-model` remains accepted
as the earlier OpenAI-only spelling. `baseUrl`, `apiKeyRef`, `apiKeyEnv` and
`apiKeyFile` still override anything the table provides.

The credential column is a **fallback**, not the entry's own name: the entry gets
`STT_KEY_<ID>` from the card (see [The settings card](#the-settings-card-web)),
and a value typed there wins. Nothing typed means the connector keeps answering,
so an entry nobody opened the card for behaves exactly as before.

## Yandex SpeechKit (`provider: yandex`)

SpeechKit is not OpenAI-compatible: no multipart, no `/audio/transcriptions`,
its own JSON. Name it instead of a model:

```yaml
- id: yandex-stt
  provider: yandex
  language: ru
```

What the entry produces:

| piece | value |
| --- | --- |
| request | `POST https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=lpcm&sampleRateHertz=16000` |
| auth | `Authorization: Api-Key <the key stored under this record's name>` |
| body | the samples of the incoming WAV with the 44-byte RIFF header dropped — no resampling, no re-encoding |
| response | `{"result": "…"}` → the transcript; an empty `result` is an empty transcript, not a failure |
| failure | `{"error_code": …, "error_message": …}` → `yandex-stt <code>: <message>` |

`provider` is the only selector; `model` and `baseUrl` do not apply and are set
to `null`. The entry has a credential name of its own — `STT_KEY_YANDEX_STT` for
the id above — and the card writes the value under it. A profile that already
names a shared key keeps it, and the live setup does:

```yaml
- id: yandex-stt
  provider: yandex
  apiKeyRef: YANDEX_SPEECHKIT_API_KEY   # the synthesizer's key, already working
```

There is no hard-wired SpeechKit name any more: the same key may be used by both
directions, but each record decides which name it reads. Bare language hints are
expanded to the codes the service accepts — `ru` → `ru-RU`, `en` → `en-US`,
`kk` → `kk-KZ`; anything unknown falls back to `ru-RU`.

## Requirements

- DeepSeek Harness `0.2.1-rc.2` or newer (the version this was tested on),
  Node 22+;
- the `speechToText` service mounted in the profile —
  `@deepseek-ai/dsh-experimental-speech-to-text`;
- for `configured-model`: the matching model connector configured in the Host;
- for `provider: yandex`: the SpeechKit API key in the Host credentials;
- for `exec`: the local binary the entry names.

## Agent instructions

For an agent wiring this up on a Host, in order:

1. `dsh plugin --profile <profile> add github:unera/dsh-speech-gate   # or @dr-co/dsh-speech-gate from npm once published`
   (or `file:/path/to/checkout` while iterating).
2. In `$DSH_HOME/profiles/<profile>/cordis.patch.yml`, mount the service row and
   insert this plugin — copy the example above. If a bundle already inserts
   `speech-to-text`, override that row (`- id: speech-to-text`) instead of
   inserting a second one.
3. Point `defaultProvider` at one of the entry `id`s (a name that is registered,
   otherwise the service fails the first call explicitly).
4. `dsh --profile <profile> --dump-config | grep -A30 speech` to confirm the
   composition, then restart the server so new plugin code loads.
5. Verify with a canonical 16 kHz mono PCM16 WAV, e.g.
   `ffmpeg -i in.ogg -ar 16000 -ac 1 -f s16le out.pcm` plus a 44-byte header, or
   by sending a voice message in a channel that feeds `speechToText`.

Troubleshooting: `speech API key is unavailable (<REF>)` means the Host has no
credential under that name — configure the model connector or set `apiKeyRef`;
`cannot tell which provider serves model` means two known providers are
configured and the model family is not distinctive — set `provider`.

## Configuration

| field | backend | meaning |
| --- | --- | --- |
| `id` | both | provider identity shown to the host (default: `openai-compatible` / `local-command` / `yandex`) |
| `provider` | both | upstream service; `yandex` switches to SpeechKit, the rest speak the OpenAI protocol |
| `name` | both | human-readable label |
| `enabled` | both | whether the record is registered at all (default `true`); the card's switch overrides it |
| `location` | both | `cloud` or `host-local`; an API record on a loopback endpoint is host-local whatever it says |
| `languages` | both | accepted language hints (default `[ru, en]`) |
| `language` | both | language sent when the caller omits one |
| `baseUrl` | api | OpenAI-compatible root, without the trailing slash (not used by `yandex`) |
| `model` | api, exec | model name (`{model}` is available in `args`; not used by `yandex`) |
| `apiKeyRef` | api | credentials reference resolved through `ctx.credentials` |
| `apiKeyEnv` | api | environment variable with the key |
| `apiKeyFile` | api | file containing the key |
| `extraFields` | api | extra multipart fields |
| `command` | exec | executable |
| `args` | exec | argument list; `{input}`, `{language}`, `{model}` are substituted |
| `stripTimestamps` | exec | drop leading `[00:00.000 --> …]` markers (default `true`) |

The key is resolved in this order: the record's own `apiKeyRef` (generated when the
profile names none), the connector's credential, `apiKeyEnv`, then `apiKeyFile`. A
local endpoint that ignores authentication needs none — such a record is `local`:
it gets no generated name, and the card draws no key field for it.

The card's switch lives in its own profile field, `enabledById` (`id → true/false`),
because the settings service writes only volatile fields and a record sits inside
the non-volatile `providers` list. A value there wins over the record's `enabled`.

## Development

```sh
npm test
npm run build      # src/client/* → lib/client.js (esbuild, wrapped for the shell)
```

Node 22+. The server half is plain ESM; `lib/client.js` is the built browser half
and is committed, because `exports["./client"]` points at it and `lib/` is in
`files` — a package published without it installs cleanly and simply has no card.

## License

MIT
