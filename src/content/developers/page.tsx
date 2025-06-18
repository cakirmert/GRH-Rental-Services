"use client"

import { Github } from "lucide-react"
import { useI18n } from "@/locales/i18n"
import { useView, View } from "@/contexts/ViewContext"
import { Container } from "@/components/ui/container"

export default function DevelopersPage() {
  const { t } = useI18n()
  const { setView } = useView()

  return (
    <Container className="max-w-3xl py-8 md:py-12 space-y-6">
      <h1 className="text-3xl font-bold text-center">{t("devPage.title")}</h1>
      <p>{t("devPage.intro")}</p>
      <h2 className="text-2xl font-semibold mt-6">{t("devPage.techTitle")}</h2>
      <div dangerouslySetInnerHTML={{ __html: t("devPage.techDesc") }} />

      <h2 className="text-2xl font-semibold mt-6">{t("devPage.whyTitle")}</h2>
      <p>{t("devPage.whyDesc")}</p>

      <h2 className="text-2xl font-semibold mt-6">{t("devPage.contribTitle")}</h2>
      <p>{t("devPage.contribDesc")}</p>
      <button
        onClick={() => setView(View.CONTACT)}
        className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
      >
        <Github className="h-5 w-5" />
        {t("devPage.repoLink")}
      </button>
    </Container>
  )
}
