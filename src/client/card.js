// The speech gate card: one row per recognizer that takes a key.
//
// Two halves on purpose. `SpeechGateView` is a pure function of its props, so a
// test renders it with fixture rows and no DOM; `SpeechGateCard` owns the only
// state there is — the snapshot from the host, the values being typed and the
// answer to the last save.
//
// The card does not decide where a key is stored. Every row the host sends has a
// credential name of its own, and this card may set the value under it; a row that
// also has a model connector behind it (`connectorRef`) says so, because leaving the
// field empty is then a legitimate choice — the connector's key answers instead.
// Local commands take no key at all and never reach this file.

import { createElement as h, Component, useEffect, useState } from 'react'
import { getState, saveCredential } from './api.js'

/** Where a SpeechKit key is issued. Named once, linked from the hint. */
export const KEY_CONSOLE_URL = 'https://aistudio.yandex.cloud/platform/'

const messageOf = (error) => String(error?.message ?? error)

/**
 * The rows of a host snapshot, as the card draws them.
 *
 * Anything that is not a row is dropped rather than rendered: the card was written
 * against a host that sends `{ id, name, apiKeyRef, connectorRef, keyPresent }`, and a
 * missing field would otherwise become `undefined` in the middle of a sentence.
 * @param snapshot - the answer of `/state`.
 * @returns the rows that can be drawn, in the host's order.
 */
export function providerRows (snapshot) {
  const rows = Array.isArray(snapshot?.providers) ? snapshot.providers : []
  return rows
    .filter((row) => row !== null && typeof row === 'object' && typeof row.id === 'string' && row.id !== '')
    .map((row) => ({
      id: row.id,
      name: typeof row.name === 'string' && row.name !== '' ? row.name : row.id,
      provider: typeof row.provider === 'string' ? row.provider : null,
      apiKeyRef: typeof row.apiKeyRef === 'string' && row.apiKeyRef !== '' ? row.apiKeyRef : null,
      // The connector's credential, when this record may fall back to it.
      connectorRef: typeof row.connectorRef === 'string' && row.connectorRef !== '' ? row.connectorRef : null,
      keyPresent: row.keyPresent === true,
      // `own` (a value under this record's name), `connector` (the model
      // settings answer instead) or nothing at all.
      keySource: row.keySource === 'own' || row.keySource === 'connector' ? row.keySource : null,
    }))
}

/** Whether this row has a credential name to write under. */
export function showsKeyField (row) {
  return typeof row?.apiKeyRef === 'string' && row.apiKeyRef !== ''
}

/**
 * Whether this row speaks Yandex SpeechKit, so the hint may point at its console.
 *
 * The upstream name comes from the host's config (`provider: yandex`); the id is a
 * fallback for a host that sent no name, because `yandex` is the default id of such
 * a record.
 * @param row - one entry of `providerRows()`.
 * @returns true when the row is SpeechKit.
 */
export function isYandexProvider (row) {
  return row?.provider === 'yandex' || row?.id === 'yandex'
}

/**
 * The readiness chip of a row.
 *
 * A value that came from the model connector says so: the person must know that
 * clearing the field is enough to fall back, and where that fallback lives.
 * @param t - the translator of this card.
 * @param row - one entry of `providerRows()`.
 * @returns the text of the chip.
 */
export function keyStateText (t, row) {
  if (row?.keyPresent !== true) return t('card.keyMissing')
  return row.keySource === 'connector' ? t('card.keyPresentConnector') : t('card.keyPresent')
}

/**
 * What a row with a model connector behind it says under the field.
 *
 * The name is the connector's own credential (`OPENAI_API_KEY`); the sentence says
 * the field may stay empty, so nobody thinks a value is required to keep a working
 * recognizer working.
 * @param t - the translator of this card.
 * @param row - one entry of `providerRows()`.
 * @returns the sentence, or null when the record has no connector.
 */
export function connectorHintText (t, row) {
  if (typeof row?.connectorRef !== 'string' || row.connectorRef === '') return null
  return String(t('card.connectorHint')).replace('{0}', row.connectorRef)
}

/** One button, because every row has one and they must look the same. */
function button (label, onClick, options = {}) {
  return h('button', {
    className: 'dsg-button',
    type: 'button',
    disabled: options.disabled === true,
    title: label,
    onClick,
  }, label)
}

/**
 * The rows of the card, as a function of the snapshot and the drafts.
 * @param props - `t`, `loading`, `providers`, `busy`, `drafts`, `notices`, `error`
 *   and the handlers `onChange`, `onSave`.
 * @returns the card element.
 */
export function SpeechGateView (props) {
  const t = typeof props?.t === 'function' ? props.t : (key) => key
  const providers = Array.isArray(props?.providers) ? props.providers : []
  const drafts = props?.drafts ?? {}
  const notices = props?.notices ?? {}
  const busy = typeof props?.busy === 'string' ? props.busy : null
  const onChange = typeof props?.onChange === 'function' ? props.onChange : () => {}
  const onSave = typeof props?.onSave === 'function' ? props.onSave : () => {}

  const children = [h('h2', { className: 'dsg-title' }, t('card.title'))]
  // The one sentence that keeps a person from opening a second SpeechKit account:
  // the synthesizer and the recognizer read the same key.
  children.push(h('p', { className: 'dsg-note' }, t('card.note')))

  if (props?.loading === true) {
    children.push(h('p', { className: 'dsg-note' }, t('card.loading')))
  } else if (providers.length === 0) {
    children.push(h('p', { className: 'dsg-note' }, t('card.empty')))
  } else {
    const rows = providers.map((row) => {
      const saving = busy === row.id
      const notice = notices[row.id] ?? null
      const fields = [
        h('div', { className: 'dsg-provider-head', key: 'head' },
          h('span', { className: 'dsg-provider-name' }, row.name),
          h('code', { className: 'dsg-provider-id' }, row.id),
          h('span', {
            className: row.keyPresent ? 'dsg-key-ok dsg-key-state' : 'dsg-key-off dsg-key-state',
            'data-key-state': row.keyPresent ? 'present' : 'missing',
          }, keyStateText(t, row))),
      ]
      if (showsKeyField(row)) {
        fields.push(
          h('div', { className: 'dsg-key-row', key: 'row' },
            h('textarea', {
              className: 'dsg-input dsg-key-input',
              // One row and a fixed height: a key is one line, and a box that can
              // be dragged taller would push the rest of the card away.
              rows: 1,
              // No password box: this is a machine token, and the password manager
              // has no business offering to remember it.
              autoComplete: 'off',
              autoCapitalize: 'off',
              autoCorrect: 'off',
              spellCheck: false,
              placeholder: t('card.keyPlaceholder'),
              'aria-label': t('card.key'),
              value: typeof drafts[row.id] === 'string' ? drafts[row.id] : '',
              disabled: saving,
              onChange: (event) => onChange(row.id, event?.target?.value ?? ''),
            }),
            button(t('card.saveKey'), () => onSave(row.id), {
              disabled: saving,
            })))
        // The name the value is written under, in small grey type: it is derived
        // from the record id and is not something a person edits here.
        fields.push(h('p', { className: 'dsg-note', key: 'name' },
          String(t('card.keyStoredAs')).replace('{0}', row.apiKeyRef)))
        // The field may stay empty when a model connector answers instead.
        const connectorHint = connectorHintText(t, row)
        if (connectorHint !== null) {
          fields.push(h('p', { className: 'dsg-note', key: 'connector' }, connectorHint))
        }
        if (isYandexProvider(row)) {
          fields.push(h('p', { className: 'dsg-hint', key: 'hint' },
            t('card.keyWhere'),
            h('a', { href: KEY_CONSOLE_URL, target: '_blank', rel: 'noreferrer' }, t('card.keyWhereLink')),
            t('card.keyWhereAfter')))
        }
      }
      if (notice !== null) {
        fields.push(h('p', { className: notice.kind === 'error' ? 'dsg-error' : 'dsg-ok', key: 'notice' },
          notice.text ?? ''))
      }
      return h('li', {
        key: row.id,
        className: 'dsg-provider',
        'data-provider': row.id,
        'data-key-source': row.keySource ?? 'none',
      }, ...fields)
    })
    children.push(h('ul', { className: 'dsg-list' }, ...rows))
  }

  if (props?.error !== null && props?.error !== undefined) {
    children.push(h('p', { className: 'dsg-error' }, t('card.error').replace('{0}', String(props.error))))
  }

  return h('section', { className: 'dsg' }, ...children)
}

/**
 * Bound the card's own failures: an exception escaping a render is a blank settings
 * page on this host, not a card that did not draw.
 */
export class CardBoundary extends Component {
  constructor (props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError (error) {
    return { error }
  }

  render () {
    if (this.state.error === null) return this.props.children
    return h('section', { className: 'dsg' },
      h('h2', { className: 'dsg-title' }, 'Распознавание речи'),
      h('p', { className: 'dsg-error' }, messageOf(this.state.error)))
  }
}

/** The section as the host mounts it: the card inside its own boundary. */
export function SpeechGatePage (props) {
  return h(CardBoundary, null, h(SpeechGateCard, props))
}

/**
 * The live card: reads the state once, writes keys through the host.
 *
 * Nothing typed is ever kept: a value goes to the host and the field is emptied.
 * An empty field is sent as it stands — the host decides whether that means "the
 * stored key stays" (`unchanged`) or "there is nothing to keep" (a refusal), so
 * the two can never disagree with the chip beside the field.
 * @param props - `t` from the settings slot.
 * @returns the card element.
 */
export function SpeechGateCard (props) {
  const t = typeof props?.t === 'function' ? props.t : (key) => key
  const [state, setState] = useState({ loading: true, providers: [], error: null })
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(null)
  const [notices, setNotices] = useState({})

  const apply = (snapshot) => setState({ loading: false, providers: providerRows(snapshot), error: null })

  useEffect(() => {
    let alive = true
    getState()
      .then((snapshot) => { if (alive) apply(snapshot) })
      .catch((error) => {
        if (alive) setState((previous) => ({ ...previous, loading: false, error: messageOf(error) }))
      })
    return () => { alive = false }
  }, [])

  const onSave = (id) => {
    const row = state.providers.find((entry) => entry.id === id)
    if (row === undefined || typeof row.apiKeyRef !== 'string') return
    const value = typeof drafts[id] === 'string' ? drafts[id].trim() : ''
    setBusy(id)
    setNotices((previous) => ({ ...previous, [id]: null }))
    saveCredential(row.apiKeyRef, value)
      .then((answer) => {
        setDrafts((previous) => ({ ...previous, [id]: '' }))
        setNotices((previous) => ({
          ...previous,
          [id]: { kind: 'ok', text: answer?.unchanged === true ? t('card.keyUnchanged') : t('card.keySaved') },
        }))
        // The chip comes from a fresh read: whether the key is there is the store's
        // answer, not this card's assumption.
        return getState().then(apply).catch(() => {})
      })
      .catch((error) => setNotices((previous) => ({
        ...previous,
        [id]: { kind: 'error', text: t('card.error').replace('{0}', messageOf(error)) },
      })))
      .finally(() => setBusy(null))
  }

  return h(SpeechGateView, {
    t,
    loading: state.loading,
    providers: state.providers,
    busy,
    drafts,
    notices,
    error: state.error,
    onChange: (id, value) => setDrafts((previous) => ({ ...previous, [id]: value })),
    onSave,
  })
}

/**
 * Settings navigation icon: a microphone with two sound arcs.
 *
 * This host draws an icon from its own slot addressed by section id; without one the
 * section keeps the shell's default glyph. Inline and in `currentColor`, so it needs
 * no asset and no rebuild per colour scheme.
 * @param props - `size` from the shell.
 * @returns the svg element.
 */
export function SpeechGateIcon (props) {
  const size = typeof props?.size === 'number' && props.size > 0 ? props.size : 16
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
  h('rect', { x: 6, y: 2, width: 4, height: 7, rx: 2 }),
  h('path', { d: 'M3.5 7.5a4.5 4.5 0 0 0 9 0' }),
  h('path', { d: 'M8 12v2' }))
}
