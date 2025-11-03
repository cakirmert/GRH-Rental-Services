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
    include: { item: { select: { titleEn: true } } },
  })

  if (upcoming.length === 0) return

  for (const booking of upcoming) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.BORROWED },
    })
    // Automatic updates should stay silent for blocked slots and scheduled transitions.
  }
}
