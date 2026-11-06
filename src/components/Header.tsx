"use client"
import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, LayoutGrid, ListChecks, CalendarCheck, UserCog, HelpCircle } from "lucide-react"
import { useCurrentAccount } from "@/features/identity/client"
import { useI18n } from "@/locales/i18n"
import { Button } from "@/components/ui/button"
import { ReportProblemButton } from "@/components/feedback/AppFeedback"
import NotificationBell from "@/components/NotificationBell"
import { AccountControl, LanguageControl, ThemeControl } from "@/features/shell/HeaderControls"

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useCurrentAccount()
  const { t } = useI18n()
  const pathname = usePathname()
  const links = [
    { href: "/", label: "header.homeLink", icon: LayoutGrid, visible: true },
    { href: "/bookings", label: "header.myBookingsLink", icon: ListChecks, visible: !!user },
    {
      href: "/staff",
      label: "header.rentalDashboardLink",
      icon: CalendarCheck,
      visible: user?.role === "RENTAL" || user?.role === "ADMIN",
    },
    {
      href: "/admin",
      label: "header.adminDashboardLink",
      icon: UserCog,
      visible: user?.role === "ADMIN",
    },
  ]
  return (
    <>
      {links
        .filter((link) => link.visible)
        .map(({ href, label, icon: Icon }) => (
          <Button key={href} asChild variant="ghost" size="sm" className="min-h-10 justify-start">
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={
                (href === "/" ? pathname === "/" : pathname?.startsWith(href)) ? "page" : undefined
              }
            >
              <Icon className="size-4" />
              {t(label)}
            </Link>
          </Button>
        ))}
    </>
  )
}
function MobileNavigation() {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 xl:hidden"
        aria-label={t("header.toggleMenu")}
        aria-expanded={open}
        aria-controls="mobile-header-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </Button>
      {open && (
        <nav
          id="mobile-header-navigation"
          className="absolute inset-x-0 top-full flex flex-col gap-2 border-b bg-background p-4 shadow-lg xl:hidden"
        >
          <Navigation onNavigate={() => setOpen(false)} />
          <div className="flex items-center justify-between border-t pt-2">
            <Button asChild variant="ghost">
              <Link href="/faq" onClick={() => setOpen(false)}>
                <HelpCircle className="size-4" />
                {t("header.helpButton")}
              </Link>
            </Button>
            <AccountControl />
          </div>
        </nav>
      )}
    </>
  )
}
export default function Header() {
  const { t } = useI18n()
  const { user } = useCurrentAccount()
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md">
      <div className="container relative mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:px-8 xl:flex">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 text-base font-bold sm:text-xl"
          aria-label={t("header.homeLink")}
        >
          <Image
            src="/gustav.png"
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 object-contain"
          />
          <span>{t("header.title")}</span>
        </Link>
        <div className="hidden items-center justify-end gap-1 xl:ml-auto xl:flex">
          <nav className="flex items-center gap-1">
            <Navigation />
          </nav>
          <Button asChild variant="ghost" size="icon">
            <Link href="/faq" aria-label={t("header.helpButton")}>
              <HelpCircle className="size-5" />
            </Link>
          </Button>
          <LanguageControl />
          <ThemeControl />
          {user && <NotificationBell />}
          <AccountControl />
        </div>
        <div className="col-start-2 row-start-1 justify-self-end xl:hidden">
          <MobileNavigation key={pathname} />
        </div>
        <ReportProblemButton className="col-start-1 row-start-2 min-h-10 w-fit max-w-full" />
        <div className="col-start-2 row-start-2 flex items-center justify-end xl:hidden">
          <LanguageControl />
          <ThemeControl />
          {user && <NotificationBell />}
        </div>
      </div>
    </header>
  )
}
