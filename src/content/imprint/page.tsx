"use client"

import { useI18n } from "@/locales/i18n"
import { Container } from "@/components/ui/container"

export default function ImprintPage() {
  const { t } = useI18n()
  return (
    <Container className="max-w-3xl py-8 md:py-12 space-y-6">
      <h1 className="text-3xl font-bold text-center">{t("imprint.title")}</h1>
      <p>{t("imprint.responsible")}</p>
      <address className="not-italic whitespace-pre-line text-foreground/80">
        {t("imprint.address")}
      </address>
      <p>
        {t("imprint.emailPrefix")}
        <a href="mailto:sv@grh-hamburg.de" className="underline">
          sv@grh-hamburg.de
        </a>
      </p>
      <p>{t("imprint.note")}</p>
    </Container>
  )
}
