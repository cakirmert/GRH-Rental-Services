import prisma from "@/lib/prismadb"
import { BookingStatus } from "@prisma/client"
import { formatInBerlin } from "@/lib/berlin-time"
import { notifyBookingStatusChange } from "@/server/notifications/bookingStatusNotifier"
import { bookingTransaction, customerNotes } from "@/server/bookingSecurity"

const AUTO_CANCEL_REASON =
  "This booking was automatically cancelled because the booking end time has passed."

/**
 * Cancel bookings that have expired (end date has passed) but are still pending/accepted
 * Should be invoked via scheduled cron endpoints.
 */
export async function cancelExpiredBookings() {
  const now = new Date()
  const expired = await prisma.booking.findMany({
    where: {
      endDate: { lt: now },
      status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED] },
    },
    select: { id: true },
  })

  let cancelled = 0
  for (const booking of expired) {
    const timestamp = formatInBerlin(now, "yyyy-MM-dd HH:mm")
    const autoNote = `System (${timestamp}):\n${AUTO_CANCEL_REASON}`

    const change = await bookingTransaction(prisma, async (tx) => {
      const current = await tx.booking.findFirst({
        where: {
          id: booking.id,
          endDate: { lt: now },
        },
        select: { status: true, notes: true },
      })
      if (
        !current ||
        (current.status !== BookingStatus.REQUESTED && current.status !== BookingStatus.ACCEPTED)
      ) {
        return null
      }
      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          notes: current.notes ? `${current.notes}\n\n${autoNote}` : autoNote,
        },
        include: {
          item: { select: { titleEn: true } },
          user: { select: { id: true, email: true, name: true } },
          assignedTo: { select: { id: true, email: true, name: true } },
        },
      })
      return { updated, expiredFrom: current.status, notes: customerNotes(current.notes) }
    })
    if (!change) continue
    cancelled++
    const { updated, expiredFrom, notes } = change

    const recipients = [
      { id: updated.userId, email: updated.user.email, name: updated.user.name },
      updated.assignedTo
        ? {
            id: updated.assignedTo.id,
            email: updated.assignedTo.email,
            name: updated.assignedTo.name,
          }
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
      expiredFrom,
      notes,
      recipients,
    })
  }
  return { cancelled }
}
