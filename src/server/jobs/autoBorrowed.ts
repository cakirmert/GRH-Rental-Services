import cron from "node-cron"
import prisma from "@/lib/prismadb"
import { BookingStatus, NotificationType } from "@prisma/client"
import { notificationEmitter } from "@/lib/notifications"

/**
 * Automatically mark accepted bookings as borrowed when their start time approaches
 * Runs every minute to check for bookings starting within 15 minutes
 */
export async function markUpcomingBookingsBorrowed() {
  const now = new Date()
  const soon = new Date(now.getTime() + 15 * 60 * 1000)

  const upcoming = await prisma.booking.findMany({
    where: {
      status: BookingStatus.ACCEPTED,
      startDate: { lte: soon, gte: now },
    },
    include: { item: { select: { titleEn: true } } },
  })

  for (const booking of upcoming) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.BORROWED },
    })
    const targets = [booking.userId, booking.assignedToId].filter(Boolean) as string[]
    for (const id of targets) {
      const n = await prisma.notification.create({
        data: {
          userId: id,
          bookingId: booking.id,
          type: NotificationType.BOOKING_RESPONSE,
          message: JSON.stringify({
            key: "notifications.autoBorrowed",
            vars: { item: booking.item.titleEn },
          }),
        },
      })
      notificationEmitter.emit("new", n)
    }
  }
}

cron.schedule("* * * * *", markUpcomingBookingsBorrowed)

// Run once on startup
markUpcomingBookingsBorrowed().catch((err) => console.error(err))
