import { BookingStatus, type Prisma, type PrismaClient } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"
import { expandBlockOccurrences, type BlockRecurrenceSpec } from "@/lib/recurring-blocks"
import { assertDateRange, peakQuantity } from "@/server/bookingSecurity"

type Database = Prisma.TransactionClient | PrismaClient
export const MAX_BLOCK_RULES_PER_ITEM = 100
const MAX_QUERY_RULES = 1000
const MAX_QUERY_BOOKINGS = 2000
const MAX_QUERY_OCCURRENCES = 10000
const MAX_DURATION_MS = 32 * 86400000

export async function requireBlockStaff(db: Database, userId: string) {
  const actor = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (actor?.role !== "ADMIN" && actor?.role !== "RENTAL") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the responsible rental team or admins can manage blocks.",
    })
  }
  return actor.role
}

export async function requireBlockItem(db: Database, userId: string, itemId: string) {
  const role = await requireBlockStaff(db, userId)
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      titleEn: true,
      titleDe: true,
      totalQuantity: true,
      active: true,
      responsibleMembers: { select: { id: true } },
    },
  })
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." })
  if (role !== "ADMIN" && !item.responsibleMembers.some((member) => member.id === userId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only manage blocks for items assigned to you.",
    })
  }
  return item
}

// A rule may start earlier than this range and still overlap it. The extra
// duration allowance also covers inclusive local-day until boundaries and DST.
export function blockRangeWhere(from: Date, to: Date): Prisma.RecurringBlockWhereInput {
  const earliestStart = new Date(from.getTime() - MAX_DURATION_MS)
  return {
    startDate: { lt: to },
    AND: [
      { OR: [{ frequency: { not: "NONE" } }, { endDate: { gt: from } }] },
      { OR: [{ until: null }, { until: { gte: earliestStart } }] },
      { OR: [{ stoppedFrom: null }, { stoppedFrom: { gt: earliestStart } }] },
    ],
  }
}

async function findBlockRules(
  db: Database,
  from: Date,
  to: Date,
  where: Prisma.RecurringBlockWhereInput,
) {
  const rules = await db.recurringBlock.findMany({
    where: { AND: [where, blockRangeWhere(from, to)] },
    include: {
      exceptions: {
        where: { occurrenceStart: { gte: new Date(from.getTime() - MAX_DURATION_MS), lt: to } },
      },
      item: { select: { id: true, titleEn: true, titleDe: true, type: true, totalQuantity: true } },
    },
    take: MAX_QUERY_RULES + 1,
  })
  if (rules.length > MAX_QUERY_RULES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Too many block rules in this range. Select a smaller range.",
    })
  }
  return rules
}

export async function blockOccurrences(
  db: Database,
  from: Date,
  to: Date,
  where: Prisma.RecurringBlockWhereInput,
) {
  assertDateRange(from, to, 400)
  const rules = await findBlockRules(db, from, to, where)
  const mapRule = (rule: (typeof rules)[number]) =>
    expandBlockOccurrences(rule, from, to).map((occurrence) => ({
      ...occurrence,
      id: `block:${rule.id}:${occurrence.occurrenceStart.toISOString()}`,
      recurringBlockId: rule.id,
      frequency: rule.frequency,
      until: rule.until,
      quantity: rule.quantity,
      status: BookingStatus.ACCEPTED,
      item: rule.item,
      user: null,
      notes: rule.reason ? `${ADMIN_BLOCK_PREFIX} ${rule.reason}` : ADMIN_BLOCK_PREFIX,
    }))
  const occurrences: ReturnType<typeof mapRule> = []
  for (const rule of rules) {
    const expanded = mapRule(rule)
    if (occurrences.length + expanded.length > MAX_QUERY_OCCURRENCES) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Too many block occurrences. Select a smaller range.",
      })
    }
    occurrences.push(...expanded)
  }
  return occurrences
}

type CapacityInterval = { startDate: Date; endDate: Date; quantity: number }

function usedWithin(intervals: CapacityInterval[], from: Date, to: Date) {
  return peakQuantity(
    intervals
      .filter((row) => row.startDate < to && row.endDate > from)
      .map((row) => ({
        ...row,
        startDate: new Date(Math.max(from.getTime(), row.startDate.getTime())),
        endDate: new Date(Math.min(to.getTime(), row.endDate.getTime())),
      })),
  )
}

/** Called inside the same serializable transaction as every capacity write. */
export async function assertBookingCapacity(
  db: Database,
  input: {
    itemId: string
    startDate: Date
    endDate: Date
    quantity: number
    totalQuantity: number
    excludeBookingId?: string
  },
  code: "BAD_REQUEST" | "CONFLICT" = "CONFLICT",
) {
  const bookings = await db.booking.findMany({
    where: {
      itemId: input.itemId,
      ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
      status: { in: [BookingStatus.ACCEPTED, BookingStatus.BORROWED] },
      startDate: { lt: input.endDate },
      endDate: { gt: input.startDate },
    },
    select: { startDate: true, endDate: true, quantity: true },
    take: MAX_QUERY_BOOKINGS + 1,
  })
  if (bookings.length > MAX_QUERY_BOOKINGS)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Too many bookings to safely check availability.",
    })
  const blocks = await blockOccurrences(db, input.startDate, input.endDate, {
    itemId: input.itemId,
  })
  if (
    usedWithin([...bookings, ...blocks], input.startDate, input.endDate) + input.quantity >
    input.totalQuantity
  ) {
    throw new TRPCError({ code, message: "Not enough units available for that time." })
  }
}

/** Check finite saved bookings, rather than expanding an indefinite rule forever. */
export async function assertBlockPreservesBookings(
  db: Database,
  itemId: string,
  totalQuantity: number,
  proposed: BlockRecurrenceSpec,
) {
  const bookings = await db.booking.findMany({
    where: {
      itemId,
      status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED] },
      endDate: { gt: new Date(Math.max(Date.now(), proposed.startDate.getTime())) },
    },
    select: { id: true, startDate: true, endDate: true, quantity: true, status: true },
    take: MAX_QUERY_BOOKINGS + 1,
  })
  if (bookings.length > MAX_QUERY_BOOKINGS)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Too many future bookings to safely create this block.",
    })

  const impacted = bookings.flatMap((booking) => {
    assertDateRange(booking.startDate, booking.endDate, 400)
    const additions = expandBlockOccurrences(proposed, booking.startDate, booking.endDate)
    return additions.length ? [{ booking, additions }] : []
  })
  if (!impacted.length) return
  const first = new Date(Math.min(...impacted.map(({ booking }) => booking.startDate.getTime())))
  const last = new Date(Math.max(...impacted.map(({ booking }) => booking.endDate.getTime())))
  const rules = await findBlockRules(db, first, last, { itemId })
  for (const { booking, additions } of impacted) {
    const blocks = rules.flatMap((rule) =>
      expandBlockOccurrences(rule, booking.startDate, booking.endDate),
    )
    const confirmed = bookings.filter(
      (row) => row.id !== booking.id && row.status !== BookingStatus.REQUESTED,
    )
    if (
      usedWithin([...confirmed, ...blocks, ...additions], booking.startDate, booking.endDate) +
        booking.quantity >
      totalQuantity
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This block would conflict with an existing booking. Choose another time or resolve the booking first.",
      })
    }
  }
}
