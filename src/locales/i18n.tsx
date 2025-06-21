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
import type { Locale, Translations, I18nContextProps } from "@/types/i18n"

const translations: Record<Locale, Translations> = { en, de }

const I18nContext = createContext<I18nContextProps | undefined>(undefined)

/**
 * Get a nested value from translations object using dot notation
 * @param obj - The translations object
 * @param key - The dot-notation key (e.g., "common.submit")
 * @returns The translation string or undefined if not found
 */
function getValue(obj: Translations, key: string): string | undefined {
  return key.split(".").reduce<string | Translations | undefined>((cur, k) => {
    if (typeof cur === "object" && cur && k in cur) {
      return (cur as Translations)[k]
    }
    return undefined
  }, obj) as string | undefined
}

/**
 * I18n provider component for managing internationalization
 * @param children - Child components
 * @returns I18n provider wrapper
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = (localStorage.getItem("grh-booking-language") as Locale) || "en"
    setLocaleState(stored)
    setMounted(true)
  }, [])

  /**
   * Set the current locale and persist to localStorage
   * @param newLoc - The new locale to set
   */
  const setLocale = useCallback((newLoc: Locale) => {
    setLocaleState(newLoc)
    localStorage.setItem("grh-booking-language", newLoc)
  }, [])

  /**
   * Translation function that resolves keys and interpolates variables
   * @param key - The translation key (e.g., "common.submit")
   * @param vars - Variables to interpolate into the translation
   * @returns The translated and interpolated string
   */
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

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {mounted ? children : <div style={{ visibility: "hidden" }}>{children}</div>}
    </I18nContext.Provider>
  )
}

/**
 * Hook to access i18n context
 * @returns I18n context with locale, setLocale, and translation function
 * @throws Error if used outside of I18nProvider
 */
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider")
  }
  return ctx
}
