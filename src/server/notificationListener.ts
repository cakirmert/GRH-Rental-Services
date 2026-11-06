import * as webpush from "web-push"
import prisma from "@/lib/prismadb"
import { notificationEmitter } from "@/lib/notifications"
import { toWebPushSubscription } from "@/lib/pushSubscription"

// Isolated environments must import this module without production push keys.
if (process.env.VERCEL_ENV !== "preview" && process.env.DISABLE_OUTBOUND !== "true") {
  webpush.setVapidDetails(
    `mailto:${process.env.CONTACT_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

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
  if (process.env.VERCEL_ENV === "preview" || process.env.DISABLE_OUTBOUND === "true") return
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })

  if (subs.length === 0) {
    return
  }

  for (const sub of subs) {
    const subscription = toWebPushSubscription(sub)
    if (!subscription) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } })
      continue
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload))
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
      // A browser push endpoint can outlive its owner's login. Keep its payload
      // free of sender, item and message details in every case. The opaque
      // booking ID is used only for the existing authenticated destination.
      let url = "/"
      try {
        const key = JSON.parse(n.message)?.key
        if (key === "notifications.newChatMessage" || key === "notifications.newChat") {
          url = n.bookingId ? `/messages/${encodeURIComponent(n.bookingId)}` : "/bookings"
        } else if (key === "notifications.bookingRequest") {
          url = "/staff"
        } else if (key && n.bookingId) {
          url = `/bookings/${encodeURIComponent(n.bookingId)}`
        } else if (key) {
          url = "/bookings"
        }
      } catch {
        // Unstructured legacy notifications still open the app without exposing text.
      }
      await sendNotification(n.userId, {
        title: "GRH Booking",
        body: "You have a new update. Open the app to view it.",
        url,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
      })
    } catch (err) {
      console.error("[Push] Error in notification event handler:", err)
    }
  })
}
