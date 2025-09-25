import cron from "node-cron"
import prisma from "@/lib/prismadb"
import { BookingStatus } from "@prisma/client"
import { format } from "date-fns"
import { notifyBookingStatusChange } from "@/server/notifications/bookingStatusNotifier"

const AUTO_CANCEL_REASON =
  "This booking was automatically cancelled because the booking end time has passed."

/**
 * Cancel bookings that have expired (end date has passed) but are still pending/accepted
 * Runs every 30 minutes to clean up expired bookings
 */
export async function cancelExpiredBookings() {
  const now = new Date()
  const expired = await prisma.booking.findMany({
    where: {
      endDate: { lt: now },
      status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED] },
    },
    include: {
      item: { select: { titleEn: true } },
      user: { select: { id: true, email: true, name: true } },
      assignedTo: { select: { id: true, email: true, name: true } },
    },
  })

  for (const booking of expired) {
    const timestamp = format(now, "yyyy-MM-dd HH:mm")
    const autoNote = `System (${timestamp}):\n${AUTO_CANCEL_REASON}`

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CANCELLED,
        notes: booking.notes ? `${booking.notes}\n\n${autoNote}` : autoNote,
      },
      include: {
        item: { select: { titleEn: true } },
        user: { select: { id: true, email: true, name: true } },
        assignedTo: { select: { id: true, email: true, name: true } },
      },
    })

    const recipients = [
      { id: updated.userId, email: updated.user.email, name: updated.user.name },
      updated.assignedTo
        ? { id: updated.assignedTo.id, email: updated.assignedTo.email, name: updated.assignedTo.name }
        : null,
    ].filter((recipient): recipient is { id: string; email: string; name: string | null } =>
      Boolean(recipient && recipient.id),
    )

    await notifyBookingStatusChange({
      prisma,
      bookingId: updated.id,
      status: BookingStatus.CANCELLED,
      itemTitle: updated.item.titleEn,
      startDate: updated.startDate,
      endDate: updated.endDate,
      notes: updated.notes,
      recipients,
      emailReason: AUTO_CANCEL_REASON,
    })
  }
}

cron.schedule("*/30 * * * *", cancelExpiredBookings)

cancelExpiredBookings().catch((err) => console.error(err))
