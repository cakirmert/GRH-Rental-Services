"use client"

import { useEffect, useState, useCallback } from "react"
import { subscribeUser, unsubscribeUser } from "@/app/actions"
import { useI18n } from "@/locales/i18n"
import { useSession } from "next-auth/react"
import { toast } from "@/components/ui/use-toast"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function PushNotificationManager() {
  const { t } = useI18n()
  const { data: session } = useSession()
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [hasPrompted, setHasPrompted] = useState(false)
  const [loading, setLoading] = useState(false)

  const subscribe = useCallback(async () => {
    if (!isSupported) return

    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      await subscribeUser(JSON.parse(JSON.stringify(sub)))
      setSubscription(sub)
    } catch {
      toast({
        title: t("common.error"),
        description: t("notifications.subscriptionFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [isSupported, t])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      await subscription?.unsubscribe()
      if (subscription) await unsubscribeUser(subscription.endpoint)
      setSubscription(null)

      toast({
        title: t("notifications.disabled"),
        description: t("notifications.disabledDesc"),
      })
    } catch (error) {
      console.error("Push unsubscription error:", error)
      toast({
        title: t("common.error"),
        description: t("notifications.unsubscriptionFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [subscription, t])

  const promptForNotifications = useCallback(async () => {
    if (!isSupported || hasPrompted) return

    setHasPrompted(true)
    localStorage.setItem("grh-notification-prompted", "true")

    try {
      // Request permission using native browser prompt
      const permission = await Notification.requestPermission()

      if (permission === "granted") {
        // Automatically subscribe if permission granted
        await subscribe()
        toast({
          title: t("notifications.enabled"),
          description: t("notifications.enabledDesc"),
        })
      } else if (permission === "denied") {
        toast({
          title: t("notifications.permissionDenied"),
          description: t("notifications.permissionDeniedDesc"),
          variant: "destructive",
        })
      }
      // If 'default', user dismissed the prompt - don't show toast
    } catch {
      // Silent error handling - errors are handled via toast notifications
    }
  }, [isSupported, hasPrompted, subscribe, t])

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true)

      navigator.serviceWorker
        .register("/sw.js")
        .then(async (reg) => {
          const sub = await reg.pushManager.getSubscription()
          setSubscription(sub)
          // Auto-prompt for notifications immediately if user is authenticated and hasn't been prompted
          if (session?.user && !sub && !hasPrompted) {
            const hasBeenPrompted = localStorage.getItem("grh-notification-prompted")

            // Check if permission is already granted or default (not denied)
            if (!hasBeenPrompted && Notification.permission === "default") {
              // Show native permission request immediately after a short delay
              setTimeout(() => {
                promptForNotifications()
              }, 1500) // Small delay to ensure page is loaded
            }
          }
        })
        .catch(() => {
          // Silent error handling
        })
    }
  }, [session, hasPrompted, promptForNotifications])

  // Export functions for use in other components (e.g., profile settings)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const pushNotificationControls = {
        subscribe,
        unsubscribe,
        isSubscribed: !!subscription,
        isSupported,
        loading,
      }
      ;(
        window as typeof window & { pushNotificationControls: typeof pushNotificationControls }
      ).pushNotificationControls = pushNotificationControls
    }
  }, [subscription, isSupported, loading, subscribe, unsubscribe])

  // This component doesn't render any UI - it only manages push notification logic
  return null
}
