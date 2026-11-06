"use client"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { locale } = useI18n()
  return (
    <section className="mx-auto max-w-md space-y-4 rounded-xl border p-8 text-center">
      <h1 className="text-2xl font-semibold">
        {locale === "de"
          ? "Die Seite konnte nicht geladen werden"
          : "This page could not be loaded"}
      </h1>
      <p>
        {locale === "de"
          ? "Bitte versuche es erneut. Über „Problem melden“ kannst du uns informieren."
          : "Please try again. You can tell us what happened using Report a problem."}
      </p>
      <Button onClick={reset}>{locale === "de" ? "Erneut versuchen" : "Try again"}</Button>
      <Button asChild variant="ghost">
        <Link href="/">{locale === "de" ? "Startseite" : "Home"}</Link>
      </Button>
    </section>
  )
}
