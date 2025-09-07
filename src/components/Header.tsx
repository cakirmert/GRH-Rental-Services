// src/components/Header.tsx
"use client"

import React, { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { useSession, signOut } from "next-auth/react"
import { useTheme } from "next-themes"
import { useI18n } from "@/locales/i18n"
import { useRouter, usePathname } from "next/navigation"
import { useView, View } from "@/contexts/ViewContext"
import { useNamePrompt } from "@/contexts/NamePromptContext"
import { useAuthModal } from "@/contexts/AuthModalContext"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Menu,
  X,
  User,
  Moon,
  Sun,
  LogOut,
  Globe,
  LayoutGrid,
  ListChecks,
  CalendarCheck,
  UserCog,
  UserCircle,
} from "lucide-react"
import NotificationBell from "@/components/NotificationBell"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export default function Header() {
  const { data: session, status } = useSession()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const { view, setView } = useView()
  const { openPrompt } = useNamePrompt()
  const { openAuthModal } = useAuthModal()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => setIsMenuOpen(false), [pathname, view])

  // Ensure header is visible when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      setHidden(false)
    }
  }, [isMenuOpen])
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      // Don't hide header when menu is open
      if (isMenuOpen) {
        setHidden(false)
        lastY.current = y
        return
      }

      if (y > 80) {
        setHidden(y > lastY.current)
      } else {
        setHidden(false)
      }
      lastY.current = y
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [isMenuOpen])
  const navigateToView = (targetView: View) => {
    if (pathname !== "/") {
      router.push("/")
      setTimeout(() => setView(targetView), 50)
    } else {
      setView(targetView)
    }
    setIsMenuOpen(false)
  }
  const handleLogoClick = () => {
    // If already on the main page and in LIST view, scroll to top
    if (pathname === "/" && view === View.LIST) {
      window.scrollTo({ top: 0, behavior: "smooth" })
      setIsMenuOpen(false)
    } else {
      // Otherwise, navigate to LIST view
      navigateToView(View.LIST)
    }
  }

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen)
    // Prevent header from hiding when menu is toggled
    if (!isMenuOpen) {
      setHidden(false)
    }
  }

  const ThemeIcon = React.useCallback(() => {
    if (!mounted) return <Sun className="h-5 w-5" />
    const current = theme === "system" ? resolvedTheme : theme
    return current === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />
  }, [mounted, theme, resolvedTheme])
  const isRentalTeam = session?.user?.role === "RENTAL" || session?.user?.role === "ADMIN"
  const isAdmin = session?.user?.role === "ADMIN"
  // Prevent hydration mismatches by using skeleton placeholders until mounted
  if (!mounted) {
    return (
      <header className="bg-background text-foreground border-b shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-10 w-10 rounded" />
              <Skeleton className="h-6 w-48" />
            </div>
            <div className="hidden md:flex items-center space-x-4 lg:space-x-6">
              <div className="flex items-center space-x-1 lg:space-x-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-28" />
              </div>
              <Skeleton className="h-9 w-12" />
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-9 w-20" />
            </div>
            <div className="md:hidden flex items-center gap-1">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-9 w-9" />
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header
      className={`bg-background bg-opacity-50 opacity-90 text-foreground border-b shadow-sm sticky top-0 z-50 transition-transform duration-300 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            {" "}
            <button
              onClick={handleLogoClick}
              className="p-0 m-0 bg-transparent border-0 cursor-pointer hover:opacity-80 transition-opacity"
              aria-label={t("header.homeLink")}
            >
              <Image
                src="/gustav.png"
                alt="Logo"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
            </button>
            <button
              onClick={handleLogoClick}
              className="text-lg sm:text-xl font-bold hover:opacity-80 transition-opacity bg-transparent border-0 p-0 m-0 cursor-pointer"
              aria-label={t("header.title")}
            >
              {t("header.title")}
            </button>
          </div>

          <div className="hidden md:flex items-center space-x-4 lg:space-x-6">
            <nav className="flex items-center space-x-1 lg:space-x-2">
              <Button variant="ghost" size="sm" onClick={handleLogoClick}>
                <LayoutGrid className="mr-1.5 h-4 w-4" />
                {t("header.homeLink")}
              </Button>
              {status === "authenticated" && (
                <Button variant="ghost" size="sm" onClick={() => navigateToView(View.MY_BOOKINGS)}>
                  <ListChecks className="mr-1.5 h-4 w-4" />
                  {t("header.myBookingsLink")}
                </Button>
              )}
              {isRentalTeam && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateToView(View.RENTAL_DASHBOARD)}
                  >
                    <CalendarCheck className="mr-1.5 h-4 w-4" />
                    {t("header.rentalDashboardLink")}
                  </Button>
                </>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateToView(View.ADMIN_DASHBOARD)}
                >
                  <UserCog className="mr-1.5 h-4 w-4" />
                  {t("header.adminDashboardLink")}
                </Button>
              )}
            </nav>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocale(locale === "en" ? "de" : "en")}
              className="flex items-center gap-1 text-sm"
            >
              <Globe className="h-4 w-4" />
              {locale.toUpperCase()}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <ThemeIcon />
                  <span className="sr-only">{t("header.toggleTheme")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                  {t("header.themeLight")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                  {t("header.themeDark")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  {t("header.themeSystem")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {status === "authenticated" && <NotificationBell />}

            {status === "authenticated" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <User className="h-5 w-5" />
                    <span className="sr-only">{t("header.userMenu")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    {t("header.signedInAs", { email: session?.user?.email ?? "" })}
                  </div>
                  <DropdownMenuSeparator />{" "}
                  <DropdownMenuItem onClick={() => navigateToView(View.MY_BOOKINGS)}>
                    <ListChecks className="mr-2 h-4 w-4" />
                    {t("header.myBookingsLink")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openPrompt}>
                    <UserCircle className="mr-2 h-4 w-4" />
                    {t("header.editProfileLink")}
                  </DropdownMenuItem>
                  {isRentalTeam && (
                    <>
                      <DropdownMenuItem onClick={() => navigateToView(View.RENTAL_DASHBOARD)}>
                        <CalendarCheck className="mr-2 h-4 w-4" />
                        {t("header.rentalDashboardLink")}
                      </DropdownMenuItem>
                    </>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigateToView(View.ADMIN_DASHBOARD)}>
                      <UserCog className="mr-2 h-4 w-4" />
                      {t("header.adminDashboardLink")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {t("header.signOutButton")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openAuthModal("email", "", () => setIsMenuOpen(false))}
              >
                {t("header.signInButton")}
              </Button>
            )}
          </div>

          {/* Mobile Controls */}
          <div className="md:hidden flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocale(locale === "en" ? "de" : "en")}
            >
              <Globe className="h-5 w-5" />
              <span className="sr-only">{t("languageSwitcher.label")}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <ThemeIcon />
                  <span className="sr-only">{t("header.toggleTheme")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                  {t("header.themeLight")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                  {t("header.themeDark")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  {t("header.themeSystem")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {status === "authenticated" && <NotificationBell />}{" "}
            <Button variant="ghost" size="icon" onClick={handleMenuToggle}>
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              <span className="sr-only">{t("header.toggleMenu")}</span>
            </Button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <nav className="md:hidden border-t bg-background">
          <div className="container mx-auto px-4 py-4 flex flex-col space-y-2">
            {" "}
            <Button variant="ghost" className="justify-start" onClick={handleLogoClick}>
              <LayoutGrid className="mr-2 h-4 w-4" />
              {t("header.homeLink")}
            </Button>
            {status === "authenticated" && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => navigateToView(View.MY_BOOKINGS)}
              >
                <ListChecks className="mr-2 h-4 w-4" />
                {t("header.myBookingsLink")}
              </Button>
            )}{" "}
            {status === "authenticated" && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setIsMenuOpen(false) // Close mobile menu
                  openPrompt()
                }}
              >
                <UserCircle className="mr-2 h-4 w-4" />
                {t("header.editProfileLink")}
              </Button>
            )}
            {isRentalTeam && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => navigateToView(View.RENTAL_DASHBOARD)}
              >
                <CalendarCheck className="mr-2 h-4 w-4" />
                {t("header.rentalDashboardLink")}
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => navigateToView(View.ADMIN_DASHBOARD)}
              >
                <UserCog className="mr-2 h-4 w-4" />
                {t("header.adminDashboardLink")}
              </Button>
            )}
            {status === "authenticated" ? (
              <Button variant="ghost" className="justify-start" onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                {t("header.signOutButton")}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => openAuthModal("email", "", () => setIsMenuOpen(false))}
              >
                {t("header.signInButton")}
              </Button>
            )}
          </div>
        </nav>
      )}

      {/* Removed local Dialog for Sign In / OTP. It's now handled by AuthModalContext */}
    </header>
  )
}
