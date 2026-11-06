"use client"
import Link from "next/link"
import { useTheme } from "next-themes"
import { Globe, Sun, Moon, User, Fingerprint, LogOut, UserCircle, HelpCircle } from "lucide-react"
import { useCurrentAccount } from "@/features/identity/client"
import { useI18n } from "@/locales/i18n"
import { useNamePrompt } from "@/contexts/NamePromptContext"
import { useAuthModal } from "@/contexts/AuthModalContext"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function LanguageControl() {
  const { locale, setLocale, t } = useI18n()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-10"
      aria-label={t("languageSwitcher.label")}
      onClick={() => setLocale(locale === "en" ? "de" : "en")}
    >
      <Globe className="size-4" />
      <span>{locale.toUpperCase()}</span>
    </Button>
  )
}
export function ThemeControl() {
  const { setTheme } = useTheme()
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={t("header.toggleTheme")}
        >
          <Sun className="size-5 dark:hidden" />
          <Moon className="hidden size-5 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["light", "dark", "system"] as const).map((mode) => (
          <DropdownMenuItem key={mode} onClick={() => setTheme(mode)}>
            {t("header.theme" + mode[0].toUpperCase() + mode.slice(1))}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
export function AccountControl() {
  const { user, status, signOut } = useCurrentAccount()
  const { t, locale } = useI18n()
  const { openPrompt } = useNamePrompt()
  const { openAuthModal } = useAuthModal()
  if (status === "loading") return <span aria-hidden className="size-10 rounded-lg bg-muted/50" />
  if (!user)
    return (
      <Button
        variant="outline"
        size="sm"
        className="min-h-10"
        onClick={() => openAuthModal("email")}
      >
        {t("header.signInButton")}
      </Button>
    )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10" aria-label={t("header.userMenu")}>
          <User className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
        <p className="max-w-xs break-words px-2 py-1 text-xs text-muted-foreground">
          {t("header.signedInAs", { email: user.email })}
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openPrompt()}>
          <UserCircle className="mr-2 size-4" />
          {t(user.name?.trim() ? "header.editProfileLink" : "header.completeProfileCta")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openPrompt({ focusSection: "passkeys" })}>
          <Fingerprint className="mr-2 size-4" />
          {locale === "de" ? "Passkeys verwalten" : "Manage passkeys"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/faq">
            <HelpCircle className="mr-2 size-4" />
            {t("header.helpButton")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut className="mr-2 size-4" />
          {t("header.signOutButton")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
