import webpush from "web-push"
import prisma from "@/lib/prismadb"
import { notificationEmitter } from "@/lib/notifications"

// Configure web push once
webpush.setVapidDetails(
  `mailto:${process.env.CONTACT_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

async function sendNotification(
  userId: string,
  payload: {
    title: string
    body: string
    url?: string
    icon?: string
    badge?: string
    data?: Record<string, unknown>
  },
) {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })

  if (subs.length === 0) {
    return
  }

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime ?? undefined,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      )
    } catch (err) {
      console.error(
        `[Push] Error sending push notification to ${sub.endpoint.substring(0, 50)}...`,
        err,
      )

      // If subscription is invalid, remove it
      if (
        err instanceof Error &&
        (err.message.includes("410") || err.message.includes("invalid"))
      ) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } })
      }
    }
  }
}

let listenerSetup = false

export function setupNotificationListener() {
  // Only set up listener once
  if (listenerSetup) {
    return
  }

  listenerSetup = true

  notificationEmitter.on("new", async (n) => {
    try {
      // Parse the message to make it more readable
      let body = n.message
      let title = "GRH Booking"
      let url = "/"
      let notificationType = "general"

      try {
        const parsed = JSON.parse(n.message)
        if (parsed.key) {
          // Handle different notification types
          if (parsed.key === "notifications.newChatMessage") {
            // For chat messages, use sender and message content
            title = `New message - ${parsed.vars?.item || "Booking"}`
            body = `${parsed.vars?.sender || "Someone"}: ${parsed.vars?.message || "New message"}`
            notificationType = "chat"
            url = `/?chat=${n.bookingId}`
          } else if (parsed.key === "notifications.newChat") {
            // Fallback for old chat notifications
            title = `New message - ${parsed.vars?.item || "Booking"}`
            body = `You have a new chat message`
            notificationType = "chat"
            url = `/?chat=${n.bookingId}`
          } else {
            // Other notification types (booking status changes)
            body = `New update for your booking`
            if (parsed.vars?.item) {
              body = `New update for ${parsed.vars.item}`
            }
            notificationType = "booking"
            url = `/?highlight=${n.bookingId}`
          }
        }
      } catch {
        // Use raw message if JSON parsing fails
      }

      await sendNotification(n.userId, {
        title: title,
        body: body,
        url: url,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        data: {
          bookingId: n.bookingId,
          type: notificationType,
        },
      })
    } catch (err) {
      console.error("[Push] Error in notification event handler:", err)
    }
  })
}
