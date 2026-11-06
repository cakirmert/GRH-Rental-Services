"use client"

import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react"
import { isCurrentUserPushSubscription, subscribeUser, unsubscribeUser } from "@/app/actions"
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

const subscribeToCapabilities = () => () => {}
const noBrowserCapabilities = () => false
const hasPushSupport = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window

export default function PushNotificationManager() {
  const { data: session, status } = useSession()
  const accountId = status === "authenticated" ? session?.user?.id : undefined
  return <AccountPushManager key={accountId ?? status} accountId={accountId} />
}

function AccountPushManager({ accountId }: { accountId?: string }) {
  const { t } = useI18n()
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const isSupported = useSyncExternalStore(
    subscribeToCapabilities,
    hasPushSupport,
    noBrowserCapabilities,
  )
  const [hasPrompted, setHasPrompted] = useState(() => {
    try {
      return typeof window !== "undefined" && !!localStorage.getItem("grh-notification-prompted")
    } catch {
      return false
    }
  })
  const [loading, setLoading] = useState(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!isSupported || !accountId || !active.current) return false

    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (!active.current) return false

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      if (!active.current) return false
      await subscribeUser(JSON.parse(JSON.stringify(sub)))
      if (!active.current) return false
      setSubscription(sub)
      return true
    } catch {
      if (!active.current) return false
      toast({
        title: t("common.error"),
        description: t("notifications.subscriptionFailed"),
        variant: "destructive",
      })
      return false
    } finally {
      if (active.current) setLoading(false)
    }
  }, [isSupported, accountId, t])

  const unsubscribe = useCallback(async () => {
    if (!accountId || !active.current) return
    setLoading(true)
    try {
      await subscription?.unsubscribe()
      if (!active.current) return
      if (subscription) await unsubscribeUser(subscription.endpoint)
      if (!active.current) return
      setSubscription(null)

      toast({
        title: t("notifications.disabled"),
        description: t("notifications.disabledDesc"),
      })
    } catch (error) {
      if (!active.current) return
      console.error("Push unsubscription error:", error)
      toast({
        title: t("common.error"),
        description: t("notifications.unsubscriptionFailed"),
        variant: "destructive",
      })
    } finally {
      if (active.current) setLoading(false)
    }
  }, [subscription, accountId, t])

  const promptForNotifications = useCallback(async () => {
    if (!isSupported || !accountId || hasPrompted || !active.current) return

    setHasPrompted(true)
    try {
      localStorage.setItem("grh-notification-prompted", "true")
    } catch {
      /* Browser storage can be disabled. */
    }

    try {
      // Request permission using native browser prompt
      const permission = await Notification.requestPermission()
      if (!active.current) return

      if (permission === "granted") {
        // Automatically subscribe if permission granted
        if (await subscribe()) {
          toast({
            title: t("notifications.enabled"),
            description: t("notifications.enabledDesc"),
          })
        }
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
  }, [isSupported, accountId, hasPrompted, subscribe, t])

  useEffect(() => {
    if (isSupported) {
      let current = true
      let promptTimer: ReturnType<typeof setTimeout> | undefined
      navigator.serviceWorker
        .register("/sw.js")
        .then(async (reg) => {
          const sub = await reg.pushManager.getSubscription()
          if (!current) return
          if (sub && accountId) {
            // A browser subscription can survive an earlier account's logout.
            // Never present it as enabled for the newly signed-in account.
            if (!(await isCurrentUserPushSubscription(sub.endpoint))) {
              await sub.unsubscribe()
              if (!current) return
              setSubscription(null)
              return
            }
          }
          setSubscription(sub)
          // Auto-prompt for notifications immediately if user is authenticated and hasn't been prompted
          if (accountId && !sub && !hasPrompted) {
            // Check if permission is already granted or default (not denied)
            if (Notification.permission === "default") {
              // Show native permission request immediately after a short delay
              promptTimer = setTimeout(() => {
                promptForNotifications()
              }, 1500) // Small delay to ensure page is loaded
            }
          }
        })
        .catch(() => {
          // Silent error handling
        })
      return () => {
        current = false
        if (promptTimer) clearTimeout(promptTimer)
      }
    }
  }, [accountId, isSupported, hasPrompted, promptForNotifications])

  // Export functions for use in other components (e.g., profile settings)
  useEffect(() => {
    const pushNotificationControls = {
      subscribe: async () => {
        await subscribe()
      },
      unsubscribe,
      isSubscribed: !!subscription,
      isSupported,
      loading,
    }
    const target = window as typeof window & {
      pushNotificationControls?: typeof pushNotificationControls
    }
    target.pushNotificationControls = pushNotificationControls
    return () => {
      if (target.pushNotificationControls === pushNotificationControls)
        delete target.pushNotificationControls
    }
  }, [subscription, isSupported, loading, subscribe, unsubscribe])

  // This component doesn't render any UI - it only manages push notification logic
  return null
}
