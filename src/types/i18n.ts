// ─ src/types/i18n.ts ─────────────────────────────────────────

/**
 * Internationalization types
 */

export type Locale = "en" | "de"

export interface Translations {
  [key: string]: string | Translations
}

export interface I18nContextProps {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}
