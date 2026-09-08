import { createContext, useContext, useEffect, useState } from 'react'
import en, { type TranslationKey } from './en'
import de from './de'
import tr from './tr'
import ru from './ru'
import pl from './pl'
import fr from './fr'
import es from './es'
import it from './it'
import el from './el'

export type Locale = 'en' | 'de' | 'tr' | 'ru' | 'pl' | 'fr' | 'es' | 'it' | 'el'

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  tr: 'Türkçe',
  ru: 'Русский',
  pl: 'Polski',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  el: 'Ελληνικά'
}

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, de, tr, ru, pl, fr, es, it, el }

// For Date#toLocaleString and similar Intl calls elsewhere in the app -
// keyed the same as the UI locale so both stay in sync from one source.
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  de: 'de-DE',
  tr: 'tr-TR',
  ru: 'ru-RU',
  pl: 'pl-PL',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  el: 'el-GR'
}

const LOCALE_KEY = 'erqf.locale'

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY)
    if (stored && stored in DICTIONARIES) return stored as Locale
  } catch {
    // ignore
  }
  return 'en'
}

type TranslateFn = (key: TranslationKey, vars?: Record<string, string | number>) => string

// Shared by the real provider and the pre-mount default context value below
// - a useLocale() call that somehow fires before/outside LocaleProvider
// (e.g. a transient state during hot-reload) should still interpolate
// correctly instead of leaking a raw "{date}" placeholder onto the screen.
function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  const template = DICTIONARIES[locale]?.[key] ?? en[key]
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: TranslateFn }>({
  locale: 'en',
  setLocale: () => {},
  t: (key, vars) => translate('en', key, vars)
})

export function LocaleProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  function setLocale(next: Locale): void {
    setLocaleState(next)
    try {
      localStorage.setItem(LOCALE_KEY, next)
    } catch {
      // ignore
    }
  }

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    return translate(locale, key, vars)
  }

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void; t: TranslateFn } {
  return useContext(LocaleContext)
}
