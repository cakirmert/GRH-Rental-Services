"use client"

import {
  Mail,
  LifeBuoy,
  Users,
  Megaphone,
  Github,
  Shield,
  FileText,
  HelpCircle,
} from "lucide-react"
import { useI18n } from "@/locales/i18n"
import { useView, View } from "@/contexts/ViewContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import GridBackground from "@/components/ui/effects/GridBackground"
import Reveal from "@/components/ui/effects/Reveal"

export default function Footer() {
  const { t } = useI18n()
  const { setView } = useView()
  return (
    <footer className="relative bg-background border-t overflow-hidden">
      {/* subtle grid backdrop */}
      <div className="absolute inset-0 -z-10">
        <GridBackground className="opacity-40 dark:opacity-20" gap={28} />
      </div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Help & Support */}
          <Reveal delayMs={60} className="space-y-4 w-full max-w-xs">
            <h3 className="font-semibold text-foreground flex items-center gap-2 tracking-tight">
              <LifeBuoy className="h-5 w-5 text-primary" />
              {t("footer.needHelpTitle")}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setView(View.FAQ)}
                  className="text-muted-foreground hover:bg-background hover:text-primary transition-colors flex items-center gap-2 h-auto p-0 justify-start text-sm"
                >
                  <HelpCircle className="h-4 w-4" />
                  {t("footer.faqLink")}
                </Button>
              </li>
              <li>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setView(View.CONTACT)}
                  className="text-muted-foreground hover:bg-background hover:text-primary transition-colors flex items-center gap-2 h-auto p-0 justify-start text-sm"
                >
                  <Megaphone className="h-4 w-4" />
                  {t("footer.suggestionsPrompt")}
                </Button>
              </li>
              <li>
                <a
                  href="mailto:rentals@grh-hamburg.de"
                  className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  rentals@grh-hamburg.de
                </a>
              </li>
            </ul>
          </Reveal>
          {/* Legal - Compact */}
          <Reveal delayMs={120} className="flex flex-col w-full max-w-xs h-full">
            <div className="flex-1" />
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView(View.DEVELOPERS)}
                className="text-muted-foreground hover:bg-background hover:text-primary transition-colors flex items-center gap-2 h-auto p-0 justify-start text-sm"
              >
                <Github className="h-4 w-4" />
                {t("footer.devInfoLink")}
              </Button>
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setView(View.PRIVACY)}
                  className="text-muted-foreground hover:bg-background hover:text-primary transition-colors flex items-center gap-2 h-auto p-0 justify-start text-sm"
                >
                  <Shield className="h-4 w-4" />
                  {t("footer.privacyLink")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setView(View.IMPRINT)}
                  className="text-muted-foreground hover:bg-background hover:text-primary transition-colors flex items-center gap-2 h-auto p-0 justify-start text-sm"
                >
                  <FileText className="h-4 w-4" />
                  {t("footer.imprintLink")}
                </Button>
              </div>
            </div>
          </Reveal>
          {/* About */}
          <Reveal delayMs={180} className="flex flex-col w-full max-w-xs h-full">
            <div className="flex-1" />
            <ul className="space-y-2 text-sm">
              <li>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setView(View.ABOUT)}
                  className="text-muted-foreground hover:bg-background hover:text-primary transition-colors flex items-center gap-2 h-auto p-0 justify-start text-sm"
                >
                  <Users className="h-4 w-4" />
                  {t("footer.aboutSvLink")}
                </Button>
              </li>
              <li>
                <a
                  href="mailto:sv@grh-hamburg.de"
                  className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  sv@grh-hamburg.de
                </a>
              </li>
            </ul>
          </Reveal>
        </div>
        {/* Compact contact/newsletter row */}
        <Reveal delayMs={220} className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4">
            <p className="text-sm text-muted-foreground">
              {t("footer.stayUpdated", { defaultValue: "Stay updated:" })}
            </p>
            <div className="w-full md:w-auto flex items-center gap-2">
              <Input
                type="email"
                inputMode="email"
                placeholder={t("common.emailPlaceholder")}
                className="h-10 md:w-72"
              />
              <Button
                variant="beam"
                onClick={() =>
                  (window.location.href =
                    "mailto:sv@grh-hamburg.de?subject=Subscribe%20newsletter")
                }
                className="h-10"
              >
                {t("common.subscribe", { defaultValue: "Subscribe" })}
              </Button>
            </div>
          </div>
          {/* Bottom section */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p className="tracking-tight">{t("footer.broughtToYou")}</p>

            <div className="flex items-center gap-4">
              <address className="not-italic">
                Gustav-Radbruch-Haus, Borgfelder Straße 16, 20537 Hamburg
              </address>
            </div>
          </div>
        </Reveal>
      </div>
    </footer>
  )
}
