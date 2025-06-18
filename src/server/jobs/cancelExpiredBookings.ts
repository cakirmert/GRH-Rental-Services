import cron from "node-cron"
import prisma from "@/lib/prismadb"
import { BookingStatus, NotificationType } from "@prisma/client"
import { notificationEmitter } from "@/lib/notifications"

export async function cancelExpiredBookings() {
  const now = new Date()
  const expired = await prisma.booking.findMany({
    where: {
      endDate: { lt: now },
      status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED] },
    },
    include: { item: { select: { titleEn: true } } },
  })

  for (const booking of expired) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED },
    })
    const targets = [booking.userId, booking.assignedToId].filter(Boolean) as string[]
    for (const id of targets) {
      const n = await prisma.notification.create({
        data: {
          userId: id,
          bookingId: booking.id,
          type: NotificationType.BOOKING_RESPONSE,
          message: JSON.stringify({
            key: "notifications.autoCancelled",
            vars: { item: booking.item.titleEn },
          }),
        },
      })
      notificationEmitter.emit("new", n)
    }
  }
}

cron.schedule("*/30 * * * *", cancelExpiredBookings)

cancelExpiredBookings().catch((err) => console.error(err))
