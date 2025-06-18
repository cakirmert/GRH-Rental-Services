"use server"

import webpush from "web-push"
import prisma from "@/lib/prismadb"
import { auth } from "../../auth"

webpush.setVapidDetails(
  `mailto:${process.env.CONTACT_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

// Save subscription for current user
export async function subscribeUser(
  sub: PushSubscription & { keys: { p256dh: string; auth: string } },
) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: {
      expirationTime: sub.expirationTime ?? null,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userId: session.user.id,
    },
    create: {
      endpoint: sub.endpoint,
      expirationTime: sub.expirationTime ?? null,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userId: session.user.id,
    },
  })
  return { success: true }
}

export async function unsubscribeUser(endpoint: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  await prisma.pushSubscription.deleteMany({ where: { userId: session.user.id, endpoint } })
  return { success: true }
}

export async function sendNotification(
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
