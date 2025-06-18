"use client"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const languages = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
]

export default function LanguageSwitcher() {
  const [locale, setLocale] = useState<string>(() => {
    // Retrieve the saved language preference from local storage or default to "en"
    if (typeof window !== "undefined") {
      return localStorage.getItem("language") || "en"
    }
    return "en"
  })

  // Save the selected language to local storage whenever it changes
  const handleSetLocale = (lang: string) => {
    setLocale(lang)
    localStorage.setItem("language", lang)
  }

  return (
    <div className="flex gap-2 ml-2">
      {languages.map((lang) => (
        <Button
          key={lang.code}
          size="sm"
          variant={lang.code === locale ? "default" : "outline"}
          onClick={() => handleSetLocale(lang.code)}
        >
          {lang.label}
        </Button>
      ))}
    </div>
  )
}
