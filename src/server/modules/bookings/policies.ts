import { BookingStatus } from "@prisma/client"
import { differenceInCalendarDays, parseISO } from "date-fns"
import { berlinContext } from "@/lib/berlin-time"
import { usesAdminBlockPrefix } from "@/utils/adminBlock"
import { OperationError, type Actor } from "../shared/operation"

export const isRentalTeamMember = (actor: Actor) => {
  const role = actor.role
  return role === "RENTAL" || role === "ADMIN"
}

export type BookingRentalScope = {
  assignedToId?: string | null
  item?: {
    responsibleMembers?: Array<{ id: string }> | null
  } | null
}

export const canManageScopedBooking = (actor: Actor, booking: BookingRentalScope) => {
  const user = actor
  if (!user?.id) return false
  if (user.role === "ADMIN") return true
  if (user.role !== "RENTAL") return false
  if (booking.assignedToId === user.id) return true
  return Boolean(booking.item?.responsibleMembers?.some((member) => member.id === user.id))
}

export const assertCanManageScopedBooking = (actor: Actor, booking: BookingRentalScope) => {
  if (!canManageScopedBooking(actor, booking)) {
    throw new OperationError({ code: "FORBIDDEN", message: "Action not allowed." })
  }
}

export const assertUserNotesDoNotUseAdminBlockPrefix = (notes?: string | null) => {
  if (usesAdminBlockPrefix(notes) || /(?:^|\n)\s*Rental Team \(/.test(notes ?? "")) {
    throw new OperationError({
      code: "BAD_REQUEST",
      message: "Notes cannot use reserved admin block syntax.",
    })
  }
}

export const canTeamTransitionStatus = (
  currentStatus: BookingStatus,
  nextStatus: BookingStatus,
  startDate: Date,
  now: Date,
) => {
  switch (currentStatus) {
    case BookingStatus.REQUESTED:
      return nextStatus === BookingStatus.ACCEPTED || nextStatus === BookingStatus.DECLINED
    case BookingStatus.ACCEPTED:
      return (
        nextStatus === BookingStatus.CANCELLED ||
        (nextStatus === BookingStatus.BORROWED &&
          startDate.getTime() <= now.getTime() + 4 * 60 * 60 * 1000)
      )
    case BookingStatus.BORROWED:
      return (
        nextStatus === BookingStatus.CANCELLED ||
        (nextStatus === BookingStatus.COMPLETED && startDate <= now)
      )
    default:
      return false
  }
}

export type NotificationRecipient = {
  id: string
  email?: string | null
  name?: string | null
}

export const filterRecipients = (
  recipients: Array<NotificationRecipient | null | undefined>,
): NotificationRecipient[] =>
  recipients.filter((recipient): recipient is NotificationRecipient =>
    Boolean(recipient && recipient.id),
  )

export const DEFAULT_MAX_RANGE_DAYS = 1
export const RENTAL_MAX_RANGE_DAYS = 13

/** One civil-time booking-window policy, shared by creation and rescheduling. */
export function bookingWindow(
  actor: Actor,
  input: { start: string; end: string },
  action: "create" | "update",
  now = new Date(),
) {
  const startDate = parseISO(input.start)
  const endDate = parseISO(input.end)
  if (
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime()) ||
    endDate <= startDate ||
    endDate.getTime() - startDate.getTime() > 14 * 86400000
  ) {
    throw new OperationError({
      code: "BAD_REQUEST",
      message: "Invalid date range (maximum 14 days).",
    })
  }
  if (startDate < now) {
    throw new OperationError({
      code: "BAD_REQUEST",
      message:
        action === "create"
          ? "Cannot book a time in the past."
          : "Cannot update booking to a time in the past.",
    })
  }
  const maxRangeDays = isRentalTeamMember(actor) ? RENTAL_MAX_RANGE_DAYS : DEFAULT_MAX_RANGE_DAYS
  if (differenceInCalendarDays(endDate, startDate, berlinContext) > maxRangeDays) {
    throw new OperationError({
      code: "BAD_REQUEST",
      message: `Booking range cannot exceed ${maxRangeDays + 1} days.`,
    })
  }
  return { startDate, endDate }
}
