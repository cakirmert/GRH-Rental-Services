"use client"

import { useI18n } from "@/locales/i18n"
import { Container } from "@/components/ui/container"

export default function PrivacyPage() {
  const { t } = useI18n()
  return (
    <Container className="max-w-3xl py-8 md:py-12 space-y-6">
      <h1 className="text-3xl font-bold text-center">{t("privacy.title")}</h1>
      <p>{t("privacy.intro")}</p>
      <h2 className="text-2xl font-semibold">{t("privacy.collectionTitle")}</h2>
      <p>{t("privacy.collectionDesc")}</p>
      <h2 className="text-2xl font-semibold">{t("privacy.storageTitle")}</h2>
      <p>{t("privacy.storageDesc")}</p>
      <h2 className="text-2xl font-semibold">{t("privacy.disclaimerTitle")}</h2>
      <p>{t("privacy.disclaimerDesc")}</p>
      <h2 className="text-2xl font-semibold">{t("privacy.contactTitle")}</h2>
      <p>{t("privacy.contactDesc")}</p>
    </Container>
  )
}
