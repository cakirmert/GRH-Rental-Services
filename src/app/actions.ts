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

  await prisma.$transaction(async (tx) => {
    const existing = await tx.pushSubscription.findUnique({ where: { endpoint: sub.endpoint }, select: { userId: true } })
    if (existing && existing.userId !== session.user.id) throw new Error("Subscription belongs to another account")
    if (existing) {
      await tx.pushSubscription.update({
        where: { endpoint: sub.endpoint, userId: session.user.id },
        data: { expirationTime: sub.expirationTime ?? null, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      })
    } else {
      await tx.pushSubscription.create({ data: {
        endpoint: sub.endpoint, userId: session.user.id,
        expirationTime: sub.expirationTime ?? null, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
      } })
    }
  }, { isolationLevel: "Serializable" })
  return { success: true }
}

export async function unsubscribeUser(endpoint: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  await prisma.pushSubscription.deleteMany({ where: { userId: session.user.id, endpoint } })
  return { success: true }
}
