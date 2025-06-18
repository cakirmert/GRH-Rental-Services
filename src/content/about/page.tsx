"use client"

import { useI18n } from "@/locales/i18n"
import { Container } from "@/components/ui/container"

export default function AboutPage() {
  const { t } = useI18n()

  return (
    <Container className="max-w-3xl py-8 md:py-12 space-y-6">
      <h1 className="text-3xl font-bold text-center">{t("aboutPage.title")}</h1>
      <p>{t("aboutPage.intro")}</p>

      <h2 className="text-2xl font-semibold mt-6">{t("aboutPage.tasksTitle")}</h2>
      <div dangerouslySetInnerHTML={{ __html: t("aboutPage.tasksPoints") }} />

      <h2 className="text-2xl font-semibold mt-6">{t("aboutPage.whyTitle")}</h2>
      <div dangerouslySetInnerHTML={{ __html: t("aboutPage.whyPoints") }} />

      <h2 className="text-2xl font-semibold mt-6">{t("aboutPage.howTitle")}</h2>
      <div dangerouslySetInnerHTML={{ __html: t("aboutPage.howPoints") }} />
    </Container>
  )
}
