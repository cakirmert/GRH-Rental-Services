"use client"
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import en from "./en.json"
import de from "./de.json"
import type { Locale, Translations, I18nContextProps } from "@/types/i18n"

const translations: Record<Locale, Translations> = { en, de }
const I18nContext = createContext<I18nContextProps | undefined>(undefined)
const eventName = "grh-language-change"
const storageKey = "grh-booking-language"
let memoryLocale: Locale | null = null
function subscribe(notify: () => void) {
  window.addEventListener(eventName, notify)
  window.addEventListener("storage", notify)
  return () => {
    window.removeEventListener(eventName, notify)
    window.removeEventListener("storage", notify)
  }
}
function readLocale(fallback: Locale): Locale {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === "de" || stored === "en" ? stored : fallback
  } catch {
    return memoryLocale ?? fallback
  }
}
function getValue(obj: Translations, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<string | Translations | undefined>(
      (cur, part) => (typeof cur === "object" && cur && part in cur ? cur[part] : undefined),
      obj,
    )
  return typeof value === "string" ? value : undefined
}

export function I18nProvider({
  children,
  initialLocale = "en",
}: {
  children: ReactNode
  initialLocale?: Locale
}) {
  const read = useCallback(() => readLocale(initialLocale), [initialLocale])
  const server = useCallback(() => initialLocale, [initialLocale])
  const locale = useSyncExternalStore(subscribe, read, server)
  useEffect(() => {
    document.documentElement.lang = locale
    document.cookie =
      "grh-locale=" +
      locale +
      "; Path=/; Max-Age=31536000; SameSite=Lax" +
      (location.protocol === "https:" ? "; Secure" : "")
  }, [locale])
  const setLocale = useCallback((next: Locale) => {
    memoryLocale = next
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      /* Current tab still changes language. */
    }
    window.dispatchEvent(new Event(eventName))
  }, [])
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw =
        getValue(translations[locale], key) ??
        getValue(en, key) ??
        String(vars?.defaultValue ?? key)
      return raw.replace(/\{([^}]+)\}/g, (match, name: string) =>
        vars?.[name] === undefined ? match : String(vars[name]),
      )
    },
    [locale],
  )
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useI18n requires I18nProvider")
  return value
}
