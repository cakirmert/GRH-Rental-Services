import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { trpc } from "@/utils/trpc"
import { toast } from "@/components/ui/use-toast"
import { useI18n } from "@/locales/i18n"
import type { SSEMessage } from "@/types/notification"

/**
 * Hook that manages real-time notifications via Server-Sent Events
 * @returns Object containing connection status
 */
export function useRealtimeNotifications() {
  const { data: session } = useSession()
  const { t } = useI18n()
  const utils = trpc.useUtils()
  const eventSourceRef = useRef<EventSource | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!session?.user) {
      return
    }

    const eventSource = new EventSource("/api/notifications/sse")
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setIsConnected(true)
    }

    eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data)

        if (message.type === "connected") {
          return
        }

        if (message.type === "notification" && message.data) {
          const notification = message.data

          utils.notifications.getAll.setData(undefined, (oldData) => {
            const notificationWithDate = {
              ...notification,
              createdAt: new Date(notification.createdAt),
              bookingId: notification.bookingId ?? null,
              type: notification.type,
            }
            const newData = [notificationWithDate, ...(oldData || [])]
            return newData.slice(0, 20) as typeof oldData
          })

          try {
            const parsed = JSON.parse(notification.message)
            if (parsed.key === "notifications.newChatMessage") {
              const senderName = parsed.vars?.sender || "Someone"
              const itemTitle = parsed.vars?.item || "Booking"
              const messagePreview = parsed.vars?.message || "New message"

              toast({
                title: `${senderName} - ${itemTitle}`,
                description: messagePreview,
                duration: 5000,
              })
            } else {
              const itemTitle = parsed.vars?.item || "Booking"
              toast({
                title: t("notifications.newUpdate"),
                description: `New update for ${itemTitle}`,
                duration: 5000,
              })
            }
          } catch {
            toast({
              title: t("notifications.newNotification"),
              description: t("notifications.checkNotifications"),
              duration: 5000,
            })
          }
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error)
      }
    }

    eventSource.onerror = () => {
      setIsConnected(false)
    }

    return () => {
      eventSource.close()
      setIsConnected(false)
    }
  }, [session?.user, utils, t])

  return { isConnected }
}
