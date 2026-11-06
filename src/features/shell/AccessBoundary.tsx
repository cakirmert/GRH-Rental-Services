"use client"
import Link from "next/link"
import { useAuthModal } from "@/contexts/AuthModalContext"
import { useI18n } from "@/locales/i18n"
import { Button } from "@/components/ui/button"

export default function AccessBoundary({ forbidden = false }: { forbidden?: boolean }) {
  const { openAuthModal } = useAuthModal()
  const { locale } = useI18n()
  const de = locale === "de"
  return (
    <section className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center">
      <h1 className="mb-3 text-2xl font-semibold">
        {forbidden
          ? de
            ? "Kein Zugriff"
            : "Access unavailable"
          : de
            ? "Bitte anmelden"
            : "Sign in to continue"}
      </h1>
      <p className="mb-6 text-muted-foreground">
        {forbidden
          ? de
            ? "Dein Konto hat keinen Zugriff auf diese Seite."
            : "Your account does not have access to this page."
          : de
            ? "Melde dich an, um deine Buchungen und Nachrichten zu öffnen."
            : "Sign in to open your bookings and messages."}
      </p>
      {!forbidden && (
        <Button className="mb-3 w-full" onClick={() => openAuthModal("email")}>
          {de ? "Anmelden" : "Sign in"}
        </Button>
      )}
      <Button asChild variant="outline" className="w-full">
        <Link href="/">{de ? "Artikel ansehen" : "Browse items"}</Link>
      </Button>
    </section>
  )
}
