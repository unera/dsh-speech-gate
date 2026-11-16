// Talking to this plugin's own host routes. No state, no cache: the card asks,
// the host answers, and a refusal surfaces as text instead of a silent empty form.
//
// The routes ride the Host's authenticated `/api` channel (`routes.mjs`), which is
// why a plain same-origin fetch is enough: the owner's cookie travels on its own
// and no token is kept in the browser.

const BASE = '/api/speech-gate'

async function request (path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    ...options,
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = text === '' ? null : JSON.parse(text)
  } catch {
    parsed = null
  }
  if (!response.ok) {
    const error = new Error(parsed?.error ?? `${response.status} ${response.statusText}`)
    error.status = response.status
    // The machine-readable half travels too: `empty_value` and a store failure are
    // two different answers to the same click, and the card may want them apart.
    if (typeof parsed?.code === 'string') error.code = parsed.code
    throw error
  }
  return parsed
}

/** The configured recognizers and whether their keys are in the store. */
export const getState = () => request('/state')

/**
 * Store an API key under the name the record declared.
 *
 * The value goes one way only: the host answers `{ ok, ref, present, unchanged? }`
 * and never echoes the key back, so the card has nothing to keep and nothing to
 * redraw it from. What the rows then show comes from a fresh `/state`.
 * @param ref - the credential name from the state.
 * @param value - the secret as typed; empty means "leave the stored one alone".
 * @returns the host's answer.
 */
export const saveCredential = (ref, value) =>
  request('/credential', { method: 'POST', body: JSON.stringify({ ref, value }) })

/**
 * Flip one recognizer's «включён» switch.
 *
 * The host answers with what actually happened — the record is registered or
 * withdrawn in the running service at once, no restart involved — and with
 * `saved`, which says whether the answer also reached the profile.
 * @param id - the record id from the state.
 * @param enabled - the new state of the switch.
 * @returns `{ ok, id, enabled, registered, saved }`.
 */
export const saveEnabled = (id, enabled) =>
  request('/enabled', { method: 'POST', body: JSON.stringify({ id, enabled }) })
