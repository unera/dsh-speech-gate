// Styles. One <style> element, mounted by an effect so unloading the plugin takes
// it away again; every class is prefixed `dsg-` to stay out of the host's way.
//
// Inline styles would do for a card this small, but a text field in the dark shell
// has to look like the rest of the panel, and the key field carries size rules that
// are easy to lose in a prop object.

export const STYLE_ID = 'dsh-speech-gate-styles'

export const CSS = `
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
   not a person's password. It has to look like a single-line input all the same —
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
`

/**
 * Put the stylesheet into the page once.
 * @param document - the page; the default is the real one.
 * @returns a disposer that removes the element again.
 */
export function mountStyle (document = globalThis.document) {
  if (document === undefined || document === null || typeof document.createElement !== 'function') {
    return () => {}
  }
  if (document.getElementById?.(STYLE_ID) !== null && document.getElementById?.(STYLE_ID) !== undefined) {
    return () => {}
  }
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  ;(document.head ?? document.body ?? document).appendChild(element)
  return () => {
    try { element.remove() } catch { /* уже снят */ }
  }
}
