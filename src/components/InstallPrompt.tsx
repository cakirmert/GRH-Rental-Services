"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/locales/i18n"
import { useSession } from "next-auth/react"
import { toast } from "@/components/ui/use-toast"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export default function InstallPrompt() {
  const { t } = useI18n()
  const { data: session } = useSession()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [hasPrompted, setHasPrompted] = useState(false)

  useEffect(() => {
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream
    const isInStandaloneMode = window.matchMedia("(display-mode: standalone)").matches

    // Don't show prompts if already installed
    if (isInStandaloneMode) return

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)

      // Show install prompt immediately for logged-in users if not already prompted
      if (session?.user && !hasPrompted) {
        const hasBeenPrompted = localStorage.getItem("grh-install-prompted")
        if (!hasBeenPrompted) {
          setTimeout(() => {
            handleInstall()
          }, 3000) // Show after 3 seconds
        }
      }
    }

    const handleInstall = async () => {
      if (!deferredPrompt || hasPrompted) return

      setHasPrompted(true)
      localStorage.setItem("grh-install-prompted", "true")

      try {
        await deferredPrompt.prompt()
        const choiceResult = await deferredPrompt.userChoice

        if (choiceResult.outcome === "accepted") {
          toast({
            title: t("install.success"),
            description: t("install.successDesc"),
          })
        }

        setDeferredPrompt(null)
      } catch (error) {
        console.error("Install prompt error:", error)
        toast({
          title: t("common.error"),
          description: t("install.error"),
          variant: "destructive",
        })
      }
    }

    const handleManualInstall = () => {
      if (hasPrompted) return

      setHasPrompted(true)
      localStorage.setItem("grh-install-prompted-ios", "true")

      // Show installation instructions as a native-like toast
      toast({
        title: t("install.title"),
        description: isIOSDevice ? t("install.ios") : t("install.message"),
        duration: 10000, // Show for 10 seconds
      })
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    // For iOS, show native-like toast if not in standalone mode
    if (isIOSDevice && !isInStandaloneMode && session?.user && !hasPrompted) {
      const hasBeenPrompted = localStorage.getItem("grh-install-prompted-ios")
      if (!hasBeenPrompted) {
        setTimeout(() => {
          handleManualInstall()
        }, 4000) // Show after 4 seconds
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    }
  }, [hasPrompted, session, deferredPrompt, t])
  // This component doesn't render any UI - it only manages install prompt logic
  return null
}
