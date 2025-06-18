import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { trpc } from "@/utils/trpc"
import { toast } from "@/components/ui/use-toast"
import { useI18n } from "@/locales/i18n"

interface NotificationData {
  id: string
  userId: string
  bookingId?: string
  type: string
  message: string
  read: boolean
  createdAt: string
}

interface SSEMessage {
  type: "connected" | "notification" | "keepalive"
  data?: NotificationData
}

export function useRealtimeNotifications() {
  const { data: session } = useSession()
  const { t } = useI18n()
  const utils = trpc.useUtils()
  const eventSourceRef = useRef<EventSource | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Only connect if user is authenticated
    if (!session?.user) {
      return
    }

    // Create SSE connection
    const eventSource = new EventSource("/api/notifications/sse")
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setIsConnected(true)
    }

    eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data)

        if (message.type === "connected") {
          // Connection established
          return
        }

        if (message.type === "notification" && message.data) {
          const notification = message.data

          // Update the notifications cache to include the new notification
          utils.notifications.getAll.setData(undefined, (oldData) => {
            // Convert createdAt to Date and ensure type and bookingId match expected types
            const notificationWithDate = {
              ...notification,
              createdAt: new Date(notification.createdAt),
              // Ensure bookingId is null if undefined
              bookingId: notification.bookingId ?? null,
              // Keep type as string (no cast, NotificationType not defined)
              type: notification.type,
            }
            const newData = [notificationWithDate, ...(oldData || [])]
            return newData.slice(0, 20) as typeof oldData // Keep only latest 20
          })

          // Parse notification message for toast display
          try {
            const parsed = JSON.parse(notification.message)
            if (parsed.key === "notifications.newChatMessage") {
              // Show toast for new chat message
              const senderName = parsed.vars?.sender || "Someone"
              const itemTitle = parsed.vars?.item || "Booking"
              const messagePreview = parsed.vars?.message || "New message"

              toast({
                title: `${senderName} - ${itemTitle}`,
                description: messagePreview,
                duration: 5000,
              })
            } else {
              // Show toast for other notifications
              const itemTitle = parsed.vars?.item || "Booking"
              toast({
                title: t("notifications.newUpdate"),
                description: `New update for ${itemTitle}`,
                duration: 5000,
              })
            }
          } catch {
            // Fallback for unparseable messages
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
      // EventSource will automatically reconnect
    }

    // Cleanup on unmount
    return () => {
      eventSource.close()
      setIsConnected(false)
    }
  }, [session?.user, utils, t])

  return { isConnected }
}
