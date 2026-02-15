import prisma from "@/lib/prismadb"
import { BookingStatus } from "@prisma/client"

/**
 * Automatically mark accepted bookings as borrowed when the start time is imminent.
 * Designed to be executed by scheduled cron hits or opportunistic triggers.
 */
export async function markUpcomingBookingsBorrowed() {
  const now = new Date()
  const soon = new Date(now.getTime() + 15 * 60 * 1000)

  const upcoming = await prisma.booking.findMany({
    where: {
      status: BookingStatus.ACCEPTED,
      startDate: {
        lte: soon,
      },
    },
  })

  if (upcoming.length === 0) return

  await prisma.booking.updateMany({
    where: {
      id: { in: upcoming.map((booking) => booking.id) },
    },
    data: { status: BookingStatus.BORROWED },
  })
  // Automatic updates should stay silent for blocked slots and scheduled transitions.
}
