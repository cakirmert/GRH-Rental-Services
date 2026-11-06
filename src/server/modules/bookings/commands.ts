import { BookingStatus, Prisma, LogType } from "@prisma/client"

import { formatInBerlin } from "@/lib/berlin-time"

import { usesAdminBlockPrefix } from "@/utils/adminBlock"
import {
  bookingTransaction,
  customerNotes,
  legacyStaffNotes,
  ownerBooking,
  staffBooking,
} from "@/server/bookingSecurity"
import { consumeBudget } from "@/lib/auth/state"

import { assertBookingCapacity, requireBlockItem } from "@/server/recurringBlocks"
import {
  bookingWindow,
  isRentalTeamMember,
  assertCanManageScopedBooking,
  assertUserNotesDoNotUseAdminBlockPrefix,
  canTeamTransitionStatus,
  filterRecipients,
} from "./policies"
import { bookingEffects, type BookingEffects } from "./effects"

import { OperationError, type OperationContext } from "../shared/operation"

import type * as contracts from "./contracts"

export async function createBooking(
  context: OperationContext,
  input: contracts.CreateBookingInput,
  effects: BookingEffects = bookingEffects,
) {
  assertUserNotesDoNotUseAdminBlockPrefix(input.notes)

  if (!(await consumeBudget("booking-create-user", context.actor.id, 20, 86400000, context.db))) {
    throw new OperationError({
      code: "TOO_MANY_REQUESTS",
      message: "Booking request limit reached.",
    })
  }

  const { startDate, endDate } = bookingWindow(context.actor, input, "create")

  const { item, booking } = await bookingTransaction(context.db, async (tx) => {
    const item = await tx.item.findUnique({
      where: { id: input.itemId },
      select: {
        type: true,
        totalQuantity: true,
        active: true,
        titleEn: true,
        titleDe: true,
        responsibleMembers: {
          select: {
            id: true,
            email: true,
            name: true,
            emailBookingNotifications: true,
          },
        },
      },
    })
    if (!item || !item.active)
      throw new OperationError({ code: "NOT_FOUND", message: "Item not found." })

    const recentCount = await tx.booking.count({
      where: {
        userId: context.actor.id,
        createdAt: { gt: new Date(Date.now() - 86400000) },
      },
    })
    const pendingCount = await tx.booking.count({
      where: { userId: context.actor.id, status: BookingStatus.REQUESTED },
    })
    if (recentCount >= 20 || pendingCount >= 20) {
      throw new OperationError({
        code: "TOO_MANY_REQUESTS",
        message: "Booking request limit reached.",
      })
    }
    const duplicate = await tx.booking.findFirst({
      where: {
        userId: context.actor.id,
        itemId: input.itemId,
        startDate,
        endDate,
        status: {
          in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED],
        },
      },
    })
    if (duplicate)
      throw new OperationError({ code: "CONFLICT", message: "This booking already exists." })

    if (item.type === "ROOM" && !input.notes?.trim()) {
      throw new OperationError({
        code: "BAD_REQUEST",
        message: "Notes are required for room bookings.",
      })
    }

    await assertBookingCapacity(
      tx,
      {
        itemId: input.itemId,
        startDate,
        endDate,
        quantity: input.quantity,
        totalQuantity: item.totalQuantity,
      },
      "BAD_REQUEST",
    )

    const booking = await tx.booking.create({
      data: {
        userId: context.actor.id,
        itemId: input.itemId,
        quantity: input.quantity,
        startDate,
        endDate,
        status: BookingStatus.REQUESTED,
        notes: input.notes ?? null,
      },
    })
    return { item, booking }
  })

  await effects.bookingRequested({
    db: context.db,
    actor: context.actor,
    item,
    booking,
    startDate,
    endDate,
    notes: input.notes,
  })

  return booking
}

export async function updateBooking(
  context: OperationContext,
  input: contracts.UpdateBookingInput,
) {
  assertUserNotesDoNotUseAdminBlockPrefix(input.notes)

  const { startDate, endDate } = bookingWindow(context.actor, input, "update")

  return bookingTransaction(context.db, async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.id },
      select: {
        userId: true,
        itemId: true,
        quantity: true,
        status: true,
        notes: true,
        staffNotes: true,
        item: { select: { active: true, totalQuantity: true } },
      },
    })

    if (!booking) {
      throw new OperationError({ code: "NOT_FOUND", message: "Booking not found." })
    }

    // Allow update only if user is the owner AND booking is REQUESTED or ACCEPTED
    // If ACCEPTED, updating it should revert status to REQUESTED.
    if (booking.userId !== context.actor.id) {
      throw new OperationError({
        code: "FORBIDDEN",
        message: "You can only update your own bookings.",
      })
    }
    if (booking.status !== BookingStatus.REQUESTED && booking.status !== BookingStatus.ACCEPTED) {
      throw new OperationError({
        code: "BAD_REQUEST",
        message: `Bookings with status "${booking.status}" cannot be updated by user.`,
      })
    }

    if (usesAdminBlockPrefix(booking.notes)) {
      throw new OperationError({
        code: "FORBIDDEN",
        message: "Availability blocks cannot be edited as bookings.",
      })
    }
    if (!booking.item.active)
      throw new OperationError({ code: "BAD_REQUEST", message: "Item is inactive." })
    await assertBookingCapacity(
      tx,
      {
        itemId: booking.itemId,
        startDate,
        endDate,
        quantity: booking.quantity,
        totalQuantity: booking.item.totalQuantity,
        excludeBookingId: input.id,
      },
      "BAD_REQUEST",
    )

    const newStatus = BookingStatus.REQUESTED // Always revert to REQUESTED on user update

    return ownerBooking(
      await tx.booking.update({
        where: { id: input.id },
        data: {
          startDate,
          endDate,
          notes: input.notes ?? customerNotes(booking.notes),
          staffNotes:
            [legacyStaffNotes(booking.notes), booking.staffNotes].filter(Boolean).join("\n\n") ||
            null,
          status: newStatus,
        },
      }),
    )
  })
}

export async function cancelBooking(
  context: OperationContext,
  input: contracts.CancelBookingInput,
  effects: BookingEffects = bookingEffects,
) {
  const updated = await bookingTransaction(context.db, async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.id },
      include: {
        item: {
          select: {
            titleEn: true,
            responsibleMembers: { select: { id: true } },
          },
        },
        user: { select: { id: true, email: true, name: true } },
        assignedTo: { select: { id: true, email: true, name: true } },
      },
    })
    if (!booking) throw new OperationError({ code: "NOT_FOUND", message: "Booking not found." })
    if (usesAdminBlockPrefix(booking.notes)) {
      await requireBlockItem(tx, context.actor.id, booking.itemId)
    } else if (booking.userId !== context.actor.id) {
      assertCanManageScopedBooking(context.actor, booking)
    }
    if (booking.status !== BookingStatus.REQUESTED && booking.status !== BookingStatus.ACCEPTED) {
      throw new OperationError({
        code: "BAD_REQUEST",
        message: `Bookings with status "${booking.status}" cannot be cancelled.`,
      })
    }

    return tx.booking.update({
      where: { id: input.id },
      data: { status: BookingStatus.CANCELLED },
      include: {
        item: { select: { titleEn: true } },
        user: { select: { id: true, email: true, name: true } },
        assignedTo: { select: { id: true, email: true, name: true } },
      },
    })
  })

  await effects.statusChanged({
    prisma: context.db,
    bookingId: updated.id,
    status: BookingStatus.CANCELLED,
    itemTitle: updated.item.titleEn,
    startDate: updated.startDate,
    endDate: updated.endDate,
    notes: customerNotes(updated.notes),
    recipients: filterRecipients([
      { id: updated.userId, email: updated.user.email, name: updated.user.name },
      updated.assignedTo
        ? {
            id: updated.assignedTo.id,
            email: updated.assignedTo.email,
            name: updated.assignedTo.name,
          }
        : null,
    ]),
    performedBy: {
      id: context.actor.id,
      name: context.actor.name ?? null,
      email: context.actor.email ?? null,
    },
  })

  await effects.recordAudit({
    type: LogType.BOOKING,
    userId: context.actor.id,
    bookingId: updated.id,
    message: "status:CANCELLED",
  })
  return ownerBooking(updated)
}

export async function addStaffNote(
  context: OperationContext,
  input: contracts.AddStaffNoteInput,
  effects: BookingEffects = bookingEffects,
) {
  if (!isRentalTeamMember(context.actor)) {
    throw new OperationError({ code: "FORBIDDEN", message: "Access denied." })
  }

  const trimmedNote = input.note.trim()
  if (!trimmedNote) {
    throw new OperationError({ code: "BAD_REQUEST", message: "Note cannot be empty." })
  }

  const updated = await bookingTransaction(context.db, async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        notes: true,
        staffNotes: true,
        assignedToId: true,
        item: { select: { responsibleMembers: { select: { id: true } } } },
      },
    })
    if (!booking) {
      throw new OperationError({ code: "NOT_FOUND", message: "Booking not found." })
    }
    assertCanManageScopedBooking(context.actor, booking)

    const noteEntry = [
      `Rental Team (${formatInBerlin(new Date(), "yyyy-MM-dd HH:mm")}):`,
      trimmedNote,
    ].join("\n")
    const updatedNotes = booking.staffNotes
      ? [booking.staffNotes, noteEntry].join("\n\n")
      : noteEntry

    return tx.booking.update({
      where: { id: input.bookingId },
      data: { staffNotes: updatedNotes },
    })
  })

  await effects.recordAudit({
    type: LogType.BOOKING,
    userId: context.actor.id,
    bookingId: updated.id,
    message: "notes:added",
  })

  return staffBooking(updated)
}

export async function transitionBooking(
  context: OperationContext,
  input: contracts.TransitionBookingInput,
  effects: BookingEffects = bookingEffects,
) {
  if (!isRentalTeamMember(context.actor)) {
    throw new OperationError({ code: "FORBIDDEN", message: "Access denied." })
  }
  const updated = await bookingTransaction(context.db, async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      include: {
        item: {
          select: {
            titleEn: true,
            totalQuantity: true,
            active: true,
            responsibleMembers: { select: { id: true } },
          },
        },
      },
    })
    if (!booking) throw new OperationError({ code: "NOT_FOUND", message: "Booking not found." })
    assertCanManageScopedBooking(context.actor, booking)
    if (usesAdminBlockPrefix(booking.notes))
      await requireBlockItem(tx, context.actor.id, booking.itemId)

    const now = new Date()
    if (!canTeamTransitionStatus(booking.status, input.newStatus, booking.startDate, now)) {
      throw new OperationError({
        code: "BAD_REQUEST",
        message: `Cannot change booking status from "${booking.status}" to "${input.newStatus}".`,
      })
    }

    if (input.newStatus === BookingStatus.ACCEPTED) {
      if (!booking.item.active)
        throw new OperationError({ code: "BAD_REQUEST", message: "Item is inactive." })
      await assertBookingCapacity(tx, {
        itemId: booking.itemId,
        startDate: booking.startDate,
        endDate: booking.endDate,
        quantity: booking.quantity,
        totalQuantity: booking.item.totalQuantity,
        excludeBookingId: booking.id,
      })
    }

    // Add any specific business logic for status transitions by team
    // e.g. if newStatus is BORROWED, assign self to assignedToId
    let assignedToUpdate: Prisma.BookingUpdateInput["assignedTo"] = undefined
    if (input.newStatus === BookingStatus.BORROWED && !booking.assignedToId) {
      assignedToUpdate = { connect: { id: context.actor.id } }
    }

    return tx.booking.update({
      where: { id: input.bookingId },
      data: {
        status: input.newStatus,
        assignedTo: assignedToUpdate,
      },
      include: {
        item: { select: { titleEn: true } },
        user: { select: { id: true, email: true, name: true } },
        assignedTo: { select: { id: true, email: true, name: true } },
      },
    })
  })

  await effects.statusChanged({
    prisma: context.db,
    bookingId: updated.id,
    status: input.newStatus,
    itemTitle: updated.item.titleEn,
    startDate: updated.startDate,
    endDate: updated.endDate,
    notes: customerNotes(updated.notes),
    recipients: filterRecipients([
      { id: updated.userId, email: updated.user.email, name: updated.user.name },
      updated.assignedTo
        ? {
            id: updated.assignedTo.id,
            email: updated.assignedTo.email,
            name: updated.assignedTo.name,
          }
        : null,
    ]),
    performedBy: {
      id: context.actor.id,
      name: context.actor.name ?? null,
      email: context.actor.email ?? null,
    },
  })
  await effects.recordAudit({
    type: LogType.BOOKING,
    userId: context.actor.id,
    bookingId: updated.id,
    message: `status:${input.newStatus}`,
  })
  return staffBooking(updated)
}
