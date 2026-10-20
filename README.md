# dsh-speech-gate

A configurable speech-to-text **provider** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Harness keeps recognizers behind the `speechToText` service
(`@deepseek-ai/dsh-experimental-speech-to-text`): a registry of named providers
that a channel resolves before transcribing. This package registers one or more
of them, so a host can offer a choice between a hosted model, a local whisper
server and a local command without any channel knowing about it.

Two backends, one package:

| backend | what it does | good for |
| --- | --- | --- |
| `api` | `POST {baseUrl}/audio/transcriptions` (OpenAI-compatible multipart) | hosted models, `whisper.cpp --server`, `faster-whisper-server`, `whisper-asr-webservice` |
| `exec` | runs a command, prints the transcript on stdout | `whisper-cli` or `faster-whisper` on the same machine |
| `configured-model` | same call as `api`, but the endpoint and key come from the model connector the Host already has | a Host whose OpenAI/Mistral model is configured once, without pasting the secret twice |

The provider never transcodes audio: the channel already hands it canonical
16 kHz mono PCM16 WAV, which is what every `speechToText` provider accepts.

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

## Requirements

- DeepSeek Harness `0.2.1-rc.2` or newer (the version this was tested on),
  Node 22+;
- the `speechToText` service mounted in the profile —
  `@deepseek-ai/dsh-experimental-speech-to-text`;
- for `configured-model`: the matching model connector configured in the Host;
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
| `id` | both | provider identity shown to the host (default: `openai-compatible` / `local-command`) |
| `name` | both | human-readable label |
| `location` | both | `cloud` or `host-local` |
| `languages` | both | accepted language hints (default `[ru, en]`) |
| `language` | both | language sent when the caller omits one |
| `baseUrl` | api | OpenAI-compatible root, without the trailing slash |
| `model` | api, exec | model name (`{model}` is available in `args`) |
| `apiKeyRef` | api | credentials reference resolved through `ctx.credentials` |
| `apiKeyEnv` | api | environment variable with the key |
| `apiKeyFile` | api | file containing the key |
| `extraFields` | api | extra multipart fields |
| `command` | exec | executable |
| `args` | exec | argument list; `{input}`, `{language}`, `{model}` are substituted |
| `stripTimestamps` | exec | drop leading `[00:00.000 --> …]` markers (default `true`) |

The key is resolved in this order: `apiKeyEnv`, then `apiKeyRef`, then
`apiKeyFile`. A local endpoint that ignores authentication needs none.

## Development

```sh
npm test
```

Node 22+; no build step, the package ships as plain ESM.

## License

MIT
