import type { PrismaClient } from "@prisma/client"
import { NotificationType } from "@prisma/client"
import type { Actor } from "../shared/operation"
import { logAction } from "@/lib/logger"
import { notifyBookingStatusChange } from "@/server/notifications/bookingStatusNotifier"
import { notificationEmitter } from "@/lib/notifications"
import { sendBookingRequestEmail } from "@/server/email/sendBookingRequestEmail"
import { markUpcomingBookingsBorrowed } from "@/server/jobs/autoBorrowed"

export type BookingRequestEvent = {
  db: PrismaClient
  actor: Actor
  item: {
    titleEn: string
    titleDe: string | null
    responsibleMembers: Array<{
      id: string
      email: string
      name: string | null
      emailBookingNotifications: boolean
    }>
  }
  booking: { id: string }
  startDate: Date
  endDate: Date
  notes?: string
}

/** Post-commit delivery preserves existing behavior; it is not a durable outbox. */
async function bookingRequested({
  db,
  actor,
  item,
  booking,
  startDate,
  endDate,
  notes,
}: BookingRequestEvent) {
  const responsibleMembers = item.responsibleMembers ?? []
  if (responsibleMembers.length > 0) {
    const itemTitle = item.titleEn || item.titleDe || "Booking"

    const notificationPayload = JSON.stringify({
      key: "notifications.bookingRequest",
      vars: { item: itemTitle },
    })

    const requester = await db.user.findUnique({
      where: { id: actor.id },
      select: { name: true, email: true },
    })

    await Promise.allSettled(
      responsibleMembers.map(async (member) => {
        if (!member?.id) return

        try {
          const notification = await db.notification.create({
            data: {
              userId: member.id,
              actorId: actor.id,
              bookingId: booking.id,
              type: NotificationType.BOOKING_REQUEST,
              message: notificationPayload,
            },
          })
          notificationEmitter.emit("new", notification)
        } catch (error) {
          console.error("[notifications] Failed to store booking request notification", error)
        }

        const wantsEmail = member.emailBookingNotifications ?? true
        if (member.email && wantsEmail) {
          try {
            await sendBookingRequestEmail({
              to: { email: member.email, name: member.name },
              requester: {
                email: requester?.email,
                name: requester?.name,
              },
              booking: {
                itemTitle,
                startDate,
                endDate,
                notes: notes,
              },
            })
          } catch (error) {
            console.error("[mail] Booking request email failed", error)
          }
        }
      }),
    )
  }
}

export const bookingEffects = {
  recordAudit: logAction,
  statusChanged: notifyBookingStatusChange,
  refreshUpcoming: markUpcomingBookingsBorrowed,
  bookingRequested,
}
export type BookingEffects = typeof bookingEffects
