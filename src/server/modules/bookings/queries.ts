import { BookingStatus, Prisma } from "@prisma/client"
import { parseISO } from "date-fns"

import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"

import { assertDateRange, ownerBooking, staffBooking } from "@/server/bookingSecurity"

import { blockOccurrences, requireBlockStaff } from "@/server/recurringBlocks"
import { isRentalTeamMember } from "./policies"
import { bookingEffects, type BookingEffects } from "./effects"

import { OperationError, type OperationContext } from "../shared/operation"

import type * as contracts from "./contracts"

export async function listBookings(context: OperationContext, input: contracts.ListBookingsInput) {
  const where: Prisma.BookingWhereInput = {}
  if (input.status) where.status = input.status

  if (input.all && context.actor.role === "ADMIN") {
    // Admins can review the full booking inventory.
  } else if (input.all && context.actor.role === "RENTAL") {
    where.OR = [
      { assignedToId: context.actor.id },
      { item: { responsibleMembers: { some: { id: context.actor.id } } } },
    ]
  } else {
    where.userId = context.actor.id
  }

  const bookings = await context.db.booking.findMany({
    where,
    include: {
      item: true, // Item details are needed for display
      user: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startDate: "asc" },
  })
  return bookings.map(input.all && isRentalTeamMember(context.actor) ? staffBooking : ownerBooking)
}

export async function listTeamBookings(
  context: OperationContext,
  input: contracts.ListTeamBookingsInput,
  effects: BookingEffects = bookingEffects,
) {
  if (!isRentalTeamMember(context.actor)) {
    throw new OperationError({ code: "FORBIDDEN", message: "Access denied." })
  }

  await effects.refreshUpcoming()

  const whereClause: Prisma.BookingWhereInput = {}
  if (context.actor.role !== "ADMIN") {
    whereClause.item = { responsibleMembers: { some: { id: context.actor.id } } }
  }
  if (input.status) {
    whereClause.status = input.status
  } else {
    // Default: Show active, actionable bookings
    whereClause.status = {
      in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED],
    }
  }
  if (!input.status || input.status === BookingStatus.ACCEPTED) {
    // SQL NOT LIKE does not match NULL: notes-free bookings are still actionable.
    // This OR stays alongside (ANDed with) the status, responsibility and search filters.
    whereClause.OR = [{ notes: null }, { NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } } }]
  }

  if (input.searchTerm) {
    whereClause.AND = [
      // Ensure AND is an array if other conditions exist
      ...(Array.isArray(whereClause.AND)
        ? whereClause.AND
        : whereClause.AND
          ? [whereClause.AND]
          : []),
      {
        OR: [
          { item: { titleEn: { contains: input.searchTerm } } },
          { item: { titleDe: { contains: input.searchTerm } } },
          { user: { name: { contains: input.searchTerm } } },
          { user: { email: { contains: input.searchTerm } } },
        ],
      },
    ]
  }
  const bookings = await context.db.booking.findMany({
    where: whereClause,
    include: {
      item: {
        select: { id: true, titleEn: true, titleDe: true, type: true, totalQuantity: true },
      }, // Include totalQuantity
      user: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } }, // Include assignedTo if rental team assigns bookings
    },
    orderBy: [{ status: "asc" }, { startDate: "asc" }], // REQUESTED first, then by date
    take: (input.limit ?? 25) + 1,
    cursor: input.cursor ? { id: input.cursor } : undefined,
  })

  let nextCursor: string | undefined = undefined
  const limit = input.limit ?? 25
  if (bookings.length > limit) {
    const nextItem = bookings.pop()
    nextCursor = nextItem!.id
  }
  return { bookings: bookings.map(staffBooking), nextCursor }
}

export async function listRentalCalendar(
  context: OperationContext,
  input: contracts.ListRentalCalendarInput,
) {
  const role = await requireBlockStaff(context.db, context.actor.id)
  const from = parseISO(input.from)
  const to = parseISO(input.to)
  assertDateRange(from, to, 400)
  const scope =
    role === "ADMIN" ? {} : { item: { responsibleMembers: { some: { id: context.actor.id } } } }
  const bookings = await context.db.booking.findMany({
    where: {
      ...scope,
      AND: [{ startDate: { lt: to } }, { endDate: { gt: from } }],
    },
    include: {
      item: {
        select: { id: true, titleEn: true, titleDe: true, type: true, totalQuantity: true },
      },
      user: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startDate: "asc" },
  })
  const blocks = await blockOccurrences(context.db, from, to, scope)
  return [...bookings.map(staffBooking), ...blocks].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  )
}

export async function getCalendarBookings(
  context: OperationContext,
  input: contracts.GetCalendarBookingsInput,
  effects: BookingEffects = bookingEffects,
) {
  assertDateRange(input.start, input.end, 400)
  const role = isRentalTeamMember(context.actor)
    ? await requireBlockStaff(context.db, context.actor.id)
    : context.actor.role

  if (role === "ADMIN" || role === "RENTAL") {
    await effects.refreshUpcoming()
  }

  const where: Prisma.BookingWhereInput = {
    AND: [{ startDate: { lt: input.end } }, { endDate: { gt: input.start } }],
  }

  if (role === "ADMIN") {
    // no additional filter
  } else if (role === "RENTAL") {
    where.item = { responsibleMembers: { some: { id: context.actor.id } } }
  } else {
    where.userId = context.actor.id
  }
  const bookings = await context.db.booking.findMany({
    where,
    include: {
      item: {
        select: { id: true, titleEn: true, titleDe: true, type: true, totalQuantity: true },
      },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startDate: "asc" },
  })
  const blocks =
    role === "ADMIN" || role === "RENTAL"
      ? await blockOccurrences(
          context.db,
          input.start,
          input.end,
          role === "ADMIN"
            ? {}
            : { item: { responsibleMembers: { some: { id: context.actor.id } } } },
        )
      : []
  return [
    ...bookings.map(isRentalTeamMember(context.actor) ? staffBooking : ownerBooking),
    ...blocks,
  ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
}
