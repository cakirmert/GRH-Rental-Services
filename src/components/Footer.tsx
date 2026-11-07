"use client"

import { Mail, LifeBuoy, Users, Megaphone, Shield, FileText, HelpCircle } from "lucide-react"
import { GitHubLogoIcon } from "@radix-ui/react-icons"
import { useI18n } from "@/locales/i18n"
import Link from "next/link"
import { RENTAL_CONTACT_EMAIL } from "@/constants/contact"

export default function Footer() {
  const { t, locale } = useI18n()
  const commit = process.env.NEXT_PUBLIC_APP_COMMIT_SHA
  const commitUrl = process.env.NEXT_PUBLIC_APP_COMMIT_URL
  const shortCommit = commit?.slice(0, 7)
  return (
    <footer className="backdrop-blur-md bg-background/20 border-t">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Help & Support */}
          <div className="space-y-4 w-full max-w-xs">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
              {t("footer.needHelpTitle")}
            </h3>{" "}
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/faq"
                  className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <HelpCircle className="h-4 w-4" />
                  {t("footer.faqLink")}
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Megaphone className="h-4 w-4" />
                  {t("footer.suggestionsPrompt")}
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${RENTAL_CONTACT_EMAIL}`}
                  className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  {RENTAL_CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
          {/* Legal - Compact */}
          <div className="flex flex-col w-full max-w-xs h-full">
            <div className="flex-1" />
            <div className="space-y-3">
              <Link
                href="/developers"
                className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <GitHubLogoIcon className="h-4 w-4" />
                {t("footer.devInfoLink")}
              </Link>
              <div className="space-y-2">
                <Link
                  href="/privacy"
                  className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Shield className="h-4 w-4" />
                  {t("footer.privacyLink")}
                </Link>
                <Link
                  href="/imprint"
                  className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <FileText className="h-4 w-4" />
                  {t("footer.imprintLink")}
                </Link>
              </div>
            </div>
          </div>
          {/* About */}
          <div className="flex flex-col w-full max-w-xs h-full">
            <div className="flex-1" />
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/about"
                  className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Users className="h-4 w-4" />
                  {t("footer.aboutSvLink")}
                </Link>
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
          </div>
        </div>
        {/* Bottom section */}
        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:justify-between items-center gap-4 text-sm text-muted-foreground text-center sm:text-left">
            <div className="w-full sm:w-auto space-y-1.5">
              <p>{t("footer.broughtToYou")}</p>
              {process.env.NEXT_PUBLIC_APP_VERSION && (
                <p className="text-xs tracking-wide">
                  GRH Rentals <span aria-hidden="true">·</span>{" "}
                  <span className="font-mono tabular-nums">
                    v{process.env.NEXT_PUBLIC_APP_VERSION}
                  </span>
                  {shortCommit && (
                    <>
                      {" "}
                      <span aria-hidden="true">·</span>{" "}
                      {commitUrl ? (
                        <a
                          href={commitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={
                            locale === "de"
                              ? `Commit ${shortCommit} auf GitHub ansehen`
                              : `View commit ${shortCommit} on GitHub`
                          }
                          className="rounded-sm font-mono underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {shortCommit}
                        </a>
                      ) : (
                        <span
                          title={
                            locale === "de"
                              ? "Lokaler Build; noch nicht auf GitHub veröffentlicht"
                              : "Local build; not yet published on GitHub"
                          }
                        >
                          <span className="font-mono">{shortCommit}</span> (
                          {locale === "de" ? "lokal" : "local"})
                        </span>
                      )}
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="flex w-full sm:w-auto justify-center sm:justify-end">
              <address className="not-italic max-w-xs sm:max-w-none text-center sm:text-right leading-relaxed">
                Gustav‑Radbruch Haus, Borgfelder Straße 16, 20537 Hamburg
              </address>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
