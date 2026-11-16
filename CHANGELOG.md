# Changelog

All notable changes to this package are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.2] - 2026-11-16

### Security

- `POST /api/speech-gate/credential` writes only under a name one of the configured
  recognizers owns (`providers[].apiKeyRef`). A grammar-valid name that belongs to
  somebody else — the model connector's `OPENAI_API_KEY`, another plugin's secret —
  is refused with `403 unknown_ref` before the credentials store is touched at all.

### Fixed

- A `configured-model` record whose model connector the Host does not have is no
  longer registered and left to fail on the first phrase with
  `provider "X" has no model connector configured`: it is skipped with the reason
  `no-connector`, and a Host that answers nothing keeps the record.
- Two concurrent roster refreshes (a saved key and the periodic re-check) can no
  longer register one record twice and lose the first disposer: settles are queued
  per record id, and a second one re-reads the record when its turn comes.
- A `speechToText.register()` that throws no longer takes the rest of the roster
  with it.

### Changed

- The switch answer (`POST /api/speech-gate/enabled`) and every `/state` row carry
  the reason word of the last settle. The card prints «включён, но не
  зарегистрирован: <reason>» instead of «провайдер выключен», and a grey row names
  the real reason instead of always reading "no key".
- The card's error boundary draws its heading from the host locale instead of a
  frozen Russian line.

### Docs

- README → Install now describes the installation the package really has: it ships
  `dsh.bundle.patch`, so `dsh plugin add` mounts the plugin, and the profile row is
  `dsh-speech-gate`. The manual insert under the foreign id `speech-provider` is
  gone — it mounted a second copy of the plugin.
- The bundled `cordis.patch.yml` names `provider: openai` explicitly next to
  `model: whisper-1`, so a Host without that connector says `no-connector` instead
  of carrying a recognizer that cannot work.

### Removed

- The unused `keyPresence` export.

## [0.4.1] - 2026-11-16

### Fixed

- A record whose key nobody could ask about yet — the credentials service mounts
  after the plugins that read it — is kept and registered instead of being dropped
  as keyless, and the roster is re-asked when the service arrives and once more
  after a short pause. Its reason words are `credentials-service-missing` and
  `key-unknown`; only a store that positively answered "no value" withdraws a
  record.

## [0.4.0] - 2026-11-16

### Added

- The settings card gained the header line saying where the recognizer itself is
  chosen, a visible «API-ключ» label of its own, the «включён» switch that
  registers and withdraws a record without a restart, and a row for a local
  recognizer saying the key is not needed.
- Local records (the `exec` backend, an API record on a loopback endpoint) are rows
  of the card as well, and get no credential name and no key field.

### Changed

- The card writes the switch into `enabledById` in the profile, because the
  settings service writes volatile fields only and a record lives inside the
  non-volatile `providers` list.

## [0.3.0] - 2026-11-16

### Added

- A web settings card — a section of its own under the Plugins page — with one row
  per recognizer, a key field that writes through the Host's authenticated `/api`
  channel, and the two routes behind it: `GET /api/speech-gate/state` and
  `POST /api/speech-gate/credential`. The browser half is built into
  `lib/client.js` and ships with the package.
- Interface dictionaries for Russian, Chinese and English.

### Changed

- The `speechToText` registry is offered only the records that can really
  transcribe: a remote record with no key is not registered, and a local one needs
  no key at all.

## [0.2.0] - 2026-11-15

### Added

- Yandex SpeechKit as a recognizer (`provider: yandex`): its own endpoint, raw PCM
  with the RIFF header dropped, an `Api-Key` header and the service's own JSON.
- Region-qualified language mapping for SpeechKit (`ru` → `ru-RU`, `kk` → `kk-KZ`).
- Each record owns its credential name (`STT_KEY_<ID>` generated from the id, or an
  `apiKeyRef` the profile spells out), so two recognizers of one account never
  share a secret by accident.
