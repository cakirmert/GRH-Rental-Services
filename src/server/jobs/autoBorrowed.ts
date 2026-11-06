import prisma from "@/lib/prismadb"
import { BookingStatus } from "@prisma/client"

/**
 * Automatically mark accepted bookings as borrowed when the start time is imminent.
 * Designed to be executed by scheduled cron hits or opportunistic triggers.
 */
export async function markUpcomingBookingsBorrowed() {
  const now = new Date()
  const soon = new Date(now.getTime() + 15 * 60 * 1000)

  return prisma.booking.updateMany({
    where: {
      status: BookingStatus.ACCEPTED,
      startDate: {
        lte: soon,
      },
      // An accepted booking that already ended belongs to expiry cancellation,
      // not the borrowed queue. Otherwise the next task can no longer cancel it.
      endDate: { gt: now },
    },
    data: { status: BookingStatus.BORROWED },
  })
}
