import { Role, BookingStatus } from "@prisma/client"

import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"

import { staffBooking } from "@/server/bookingSecurity"
import { assertAdmin } from "../shared/operation"

import { type OperationContext } from "../shared/operation"

export async function getDashboardStatistics(context: OperationContext) {
  assertAdmin(context.actor)
  const [totalItems, teamMemberCount, pendingBookings, upcomingBookings] = await Promise.all([
    // Get total items count (only active items)
    context.db.item.count({
      where: { active: true },
    }),
    // Get team member count (RENTAL + ADMIN roles)
    context.db.user.count({
      where: { role: { in: [Role.RENTAL, Role.ADMIN] } },
    }),
    // Get pending bookings count (REQUESTED status)
    context.db.booking.count({
      where: {
        status: BookingStatus.REQUESTED,
        NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } },
      },
    }),
    context.db.booking.count({
      where: {
        startDate: { gte: new Date() },
        status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED] },
        NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } },
      },
    }),
  ])

  return {
    totalItems,
    teamMemberCount,
    pendingBookings,
    upcomingBookings,
  }
}

export async function listStaffCancellations(context: OperationContext) {
  assertAdmin(context.actor)
  const cutoffDate = new Date("2025-10-22T00:00:00.000Z")

  const bookings = await context.db.booking.findMany({
    where: {
      status: BookingStatus.CANCELLED,
      updatedAt: { gte: cutoffDate },
      NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } },
    },
    include: {
      item: { select: { id: true, titleEn: true, titleDe: true, type: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  })

  if (bookings.length === 0) return []

  const bookingIds = bookings.map((b) => b.id)

  const cancellationLogs = await context.db.log.findMany({
    where: {
      bookingId: { in: bookingIds },
      message: "status:CANCELLED",
    },
    orderBy: { createdAt: "desc" },
  })

  const latestCancellationLogByBooking = new Map<string, (typeof cancellationLogs)[number]>()
  for (const log of cancellationLogs) {
    if (log.bookingId && !latestCancellationLogByBooking.has(log.bookingId)) {
      latestCancellationLogByBooking.set(log.bookingId, log)
    }
  }

  const staffIds = Array.from(
    new Set(
      Array.from(latestCancellationLogByBooking.values())
        .map((log) => log.userId)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const staffMembers = staffIds.length
    ? await context.db.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : []

  const staffById = new Map(staffMembers.map((staff) => [staff.id, staff]))

  const allowedRoles = new Set<Role>([Role.ADMIN, Role.RENTAL])

  return bookings
    .map((booking) => {
      const log = latestCancellationLogByBooking.get(booking.id)
      if (!log?.userId) return null
      const staff = staffById.get(log.userId)
      if (!staff || !allowedRoles.has(staff.role)) return null
      return {
        ...staffBooking(booking),
        cancelledBy: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
        },
        cancelledAt: log.createdAt,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}
