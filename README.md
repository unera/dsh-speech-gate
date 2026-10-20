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

The provider never transcodes audio: the channel already hands it canonical
16 kHz mono PCM16 WAV, which is what every `speechToText` provider accepts.

## Install

```sh
dsh plugin --profile <profile> add github:unera/dsh-speech-gate
```

Then mount it in the profile patch (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`)
next to the service it feeds:

```yaml
- id: speech-to-text
  config:
    defaultProvider: openai-compatible
    language: ru
- insert:
    - id: speech-provider
      name: dsh-speech-gate
      config:
        providers:
          - id: openai-compatible
            backend: api
            name: OpenAI gpt-4o-mini-transcribe
            location: cloud
            languages: [ru, en]
            baseUrl: https://api.openai.com/v1
            model: gpt-4o-mini-transcribe
            apiKeyFile: ~/.config/dsh-stt/openai.key
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
language) appears in the Web UI under *Plugins → Voice Input*.

A flat config (`backend`, `baseUrl`, `model`, …) registers a single provider and
is still supported.

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
