// Client plugin entry: one settings section, its icon and its dictionaries.
//
// The card itself lives in `card.js`; this file only mounts the contributions and
// keeps a broken one from taking the others down with it. Nothing here reads the
// host's own settings document — the host routes (`routes.mjs`) answer that.

import { DICTIONARIES, NS } from './locales.js'
import { mountStyle } from './styles.js'
import { SpeechGateIcon, SpeechGatePage } from './card.js'

export const id = 'dsh-speech-gate'

/** The slots this client half plugs into. */
export const inject = ['slots', 'locale']

/**
 * The section id: what the host uses to address this section and its icon, so it
 * is the same in both registrations.
 */
export const SECTION_ID = 'speech-gate'

/**
 * Where the section sits in the settings navigation.
 *
 * After the neighbouring speech packages — dsh-nodes is 35, dsh-text-to-speech is
 * 39 — so the two speech cards stand next to each other.
 */
export const SECTION_ORDER = 40

/**
 * Mount one contribution; a failure is reported and the rest still mount.
 *
 * An exception escaping `apply` marks the whole client bundle as failed, which on
 * this host shows up as a plugin that did not load rather than as a card that did
 * not appear.
 * @param ctx - client root context.
 * @param label - what is being mounted, for the warning.
 * @param run - the mounting call.
 * @returns whether it mounted.
 */
function safeMount (ctx, label, run) {
  try {
    run()
    return true
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[dsh-speech-gate] ${label} не смонтирован: ${error?.message ?? error}`)
    return false
  }
}

/**
 * Client plugin entry.
 * @param ctx - client root context: `slots`, `locale`, `effect`.
 */
export function apply (ctx) {
  let t = (key) => key
  try {
    t = ctx.locale.bind(NS)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[dsh-speech-gate] locale недоступна, показываю ключи: ${error?.message ?? error}`)
  }

  safeMount(ctx, 'dictionaries', () => {
    ctx.effect(() => {
      ctx.locale.register(NS, 'en', DICTIONARIES.en)
      ctx.locale.register(NS, 'zh', DICTIONARIES.zh)
      return () => {}
    }, 'dsh-speech-gate: dictionaries')
  })

  // Another plugin may have registered `ru` first; the registry throws on a
  // duplicate id, and that must not take this card down with it.
  safeMount(ctx, 'ru language', () => {
    ctx.effect(() => {
      try {
        return ctx.locale.addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' })
      } catch (error) {
        if (!/already/i.test(String(error?.message ?? error))) throw error
        return () => {}
      }
    }, 'dsh-speech-gate: ru language')
  })

  safeMount(ctx, 'ru dictionary', () => {
    ctx.effect(() => {
      ctx.locale.register(NS, 'ru', DICTIONARIES.ru)
      return () => {}
    }, 'dsh-speech-gate: ru dictionary')
  })

  safeMount(ctx, 'styles', () => ctx.effect(() => mountStyle(), 'dsh-speech-gate: styles'))

  safeMount(ctx, 'settings.section', () => {
    ctx.slots.inject('settings.section', () =>
      ctx.slots.register(
        {
          name: 'settings.section',
          id: SECTION_ID,
          order: SECTION_ORDER,
          // Without `locale` the host does not inject `t` and the card draws keys.
          locale: NS,
          label: () => t('nav.title'),
        },
        SpeechGatePage
      )
    )
  })

  safeMount(ctx, 'settings.section.icon', () => {
    ctx.slots.inject('settings.section.icon', () =>
      ctx.slots.register(
        {
          name: 'settings.section.icon',
          id: SECTION_ID,
          order: SECTION_ORDER,
          label: () => t('nav.title'),
        },
        SpeechGateIcon
      )
    )
  })
}
