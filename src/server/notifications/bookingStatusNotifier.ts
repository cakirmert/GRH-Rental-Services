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
  performedBy?: {
    name?: string | null
    email?: string | null
  }
}

const messageMap: Record<BookingStatus, { base: string; withActor?: string }> = {
  [BookingStatus.REQUESTED]: {
    base: "notifications.status.requested",
    withActor: "notifications.status.requestedBy",
  },
  [BookingStatus.ACCEPTED]: {
    base: "notifications.status.accepted",
    withActor: "notifications.status.acceptedBy",
  },
  [BookingStatus.DECLINED]: {
    base: "notifications.status.declined",
    withActor: "notifications.status.declinedBy",
  },
  [BookingStatus.BORROWED]: {
    base: "notifications.status.borrowed",
    withActor: "notifications.status.borrowedBy",
  },
  [BookingStatus.COMPLETED]: {
    base: "notifications.status.completed",
    withActor: "notifications.status.completedBy",
  },
  [BookingStatus.CANCELLED]: {
    base: "notifications.status.cancelled",
    withActor: "notifications.status.cancelledBy",
  },
}

const fallbackActorLabel = "GRH Rental Services"

const getActorName = (performedBy?: { name?: string | null; email?: string | null }) => {
  if (!performedBy) return null
  const { name, email } = performedBy
  if (name?.trim()) return name.trim()
  if (email?.trim()) return email.trim()
  return fallbackActorLabel
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
  performedBy,
}: NotifyBookingStatusChangeArgs) {
  const dedupedRecipients = new Map<string, Recipient>()
  for (const recipient of recipients) {
    if (!recipient?.id) continue
    if (!dedupedRecipients.has(recipient.id)) {
      dedupedRecipients.set(recipient.id, recipient)
    }
  }

  if (dedupedRecipients.size === 0) return

  const actorName = getActorName(performedBy)
  const statusMessage = messageMap[status] ?? messageMap[BookingStatus.REQUESTED]
  const key = actorName && statusMessage.withActor ? statusMessage.withActor : statusMessage.base

  if (status === BookingStatus.BORROWED && !actorName) {
    return
  }

  for (const recipient of dedupedRecipients.values()) {
    const notification = await prisma.notification.create({
      data: {
        userId: recipient.id,
        bookingId,
        type: NotificationType.BOOKING_RESPONSE,
        message: JSON.stringify({
          key,
          vars: {
            item: itemTitle,
            ...(actorName ? { actor: actorName } : {}),
          },
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
          performedBy: actorName ?? undefined,
        })
      } catch (error) {
        console.error("[mail] Failed to send booking status email", error)
      }
    }
  }
}
