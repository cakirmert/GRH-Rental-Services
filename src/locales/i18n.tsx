// locales/i18n.tsx
"use client"
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react"
import en from "./en.json"
import de from "./de.json"

export type Locale = "en" | "de"

interface Translations {
  [key: string]: string | Translations
}
const translations: Record<Locale, Translations> = { en, de }

interface I18nContextProps {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextProps | undefined>(undefined)

function getValue(obj: Translations, key: string): string | undefined {
  return key.split(".").reduce<string | Translations | undefined>((cur, k) => {
    if (typeof cur === "object" && cur && k in cur) {
      return (cur as Translations)[k]
    }
    return undefined
  }, obj) as string | undefined
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // 1) Default to "en" until we read localStorage
  const [locale, setLocaleState] = useState<Locale>("en")
  const [mounted, setMounted] = useState(false)

  // 2) After hydration, read the stored language
  useEffect(() => {
    const stored = (localStorage.getItem("grh-booking-language") as Locale) || "en"
    setLocaleState(stored)
    setMounted(true)
  }, [])

  const setLocale = useCallback((newLoc: Locale) => {
    setLocaleState(newLoc)
    localStorage.setItem("grh-booking-language", newLoc)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = getValue(translations[locale], key)
      let out = raw ?? key
      if (vars) {
        for (const k in vars) {
          out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]))
        }
      }
      return out
    },
    [locale],
  )

  // 3) **Always** render the Provider—never return early.
  //    Hide the children until we're mounted so SSR/CSR match.
  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {mounted ? children : <div style={{ visibility: "hidden" }}>{children}</div>}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider")
  }
  return ctx
}
