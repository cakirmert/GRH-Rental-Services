"use server"

import prisma from "@/lib/prismadb"
import { auth } from "../../auth"
import { assertValidPushSubscription } from "@/lib/pushSubscription"

// Save subscription for current user
export async function subscribeUser(
  sub: PushSubscription & { keys: { p256dh: string; auth: string } },
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  assertValidPushSubscription(sub)

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
  if (!session?.user?.id) throw new Error("Unauthorized")
  await prisma.pushSubscription.deleteMany({ where: { userId: session.user.id, endpoint } })
  return { success: true }
}
