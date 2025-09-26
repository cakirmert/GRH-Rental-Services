import { BookingStatus, NotificationType } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import { notificationEmitter } from "@/lib/notifications"
import { sendBookingStatusEmail } from "@/server/email/sendBookingStatusEmail"

interface Recipient {
  id: string
  email?: string | null
  name?: string | null
}

interface NotifyBookingStatusChangeArgs {
  prisma: PrismaClient
  bookingId: string
  status: BookingStatus
  itemTitle: string
  startDate: Date
  endDate: Date
  notes?: string | null
  recipients: Recipient[]
}

const messageMap: Record<BookingStatus, string> = {
  [BookingStatus.REQUESTED]: "notifications.status.requested",
  [BookingStatus.ACCEPTED]: "notifications.status.accepted",
  [BookingStatus.DECLINED]: "notifications.status.declined",
  [BookingStatus.BORROWED]: "notifications.status.borrowed",
  [BookingStatus.COMPLETED]: "notifications.status.completed",
  [BookingStatus.CANCELLED]: "notifications.status.cancelled",
}

export async function notifyBookingStatusChange({
  prisma,
  bookingId,
  status,
  itemTitle,
  startDate,
  endDate,
  notes,
  recipients,
}: NotifyBookingStatusChangeArgs) {
  const dedupedRecipients = new Map<string, Recipient>()
  for (const recipient of recipients) {
    if (!recipient?.id) continue
    if (!dedupedRecipients.has(recipient.id)) {
      dedupedRecipients.set(recipient.id, recipient)
    }
  }

  if (dedupedRecipients.size === 0) return

  for (const recipient of dedupedRecipients.values()) {
    const notification = await prisma.notification.create({
      data: {
        userId: recipient.id,
        bookingId,
        type: NotificationType.BOOKING_RESPONSE,
        message: JSON.stringify({
          key: messageMap[status] ?? messageMap[BookingStatus.REQUESTED],
          vars: { item: itemTitle },
        }),
      },
    })
    notificationEmitter.emit("new", notification)

    if (
      (status === BookingStatus.ACCEPTED || status === BookingStatus.CANCELLED) &&
      recipient.email
    ) {
      try {
        await sendBookingStatusEmail({
          to: { email: recipient.email, name: recipient.name },
          booking: { itemTitle, startDate, endDate },
          status,
          notes,
        })
      } catch (error) {
        console.error("[mail] Failed to send booking status email", error)
      }
    }
  }
}
