import { PrismaClient } from "@prisma/client"
import {
  BLOCK_TIME_ZONE,
  expandBlockOccurrences,
  parseBerlinDateTime,
  validateBlockRecurrence,
} from "../src/lib/recurring-blocks"
import { assertDateRange, bookingTransaction } from "../src/server/bookingSecurity"
import { assertBlockPreservesBookings } from "../src/server/recurringBlocks"

/** Maintenance only: never changes a reservation or runs during application startup. */
export async function restoreWeeklyBarBlock(
  db: PrismaClient,
  options: { itemId: string; blockId: string; apply: boolean; preserveBookingId?: string },
) {
  const { itemId, blockId, apply, preserveBookingId } = options
  return bookingTransaction(db, async (tx) => {
    if (!apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`
    const item = await tx.item.findUnique({
      where: { id: itemId },
      select: { titleEn: true, active: true, totalQuantity: true },
    })
    if (!item || item.titleEn !== "Bar" || !item.active) {
      throw new Error("The expected active Bar item was not found; nothing changed.")
    }
    const existing = await tx.recurringBlock.findUnique({ where: { id: blockId } })
    if (existing) {
      if (existing.itemId !== itemId)
        throw new Error("Unexpected release block identifier; nothing changed.")
      return { status: "already present", existingSchedulePreserved: true }
    }
    const duplicate = await tx.recurringBlock.findFirst({
      where: { itemId, frequency: "WEEKLY", until: null, stoppedFrom: null },
    })
    if (duplicate)
      throw new Error(
        "An indefinite weekly Bar block already exists; review it before restoring another.",
      )

    const data = {
      id: blockId,
      itemId,
      startDate: parseBerlinDateTime("2026-11-06T14:00"),
      endDate: parseBerlinDateTime("2026-11-07T14:00"),
      frequency: "WEEKLY",
      timeZone: BLOCK_TIME_ZONE,
      quantity: item.totalQuantity,
      reason: "Blocked for weekly parties.",
    }
    validateBlockRecurrence(data)
    const exceptions: { occurrenceStart: Date }[] = []
    const replacements: (typeof data)[] = []
    if (preserveBookingId) {
      const booking = await tx.booking.findUnique({
        where: { id: preserveBookingId },
        select: { itemId: true, status: true, startDate: true, endDate: true },
      })
      if (
        !booking ||
        booking.itemId !== itemId ||
        !["REQUESTED", "ACCEPTED", "BORROWED"].includes(booking.status) ||
        booking.endDate <= new Date() ||
        item.totalQuantity !== 1
      ) {
        throw new Error("The selected booking is not an active reservation for this Bar.")
      }
      assertDateRange(booking.startDate, booking.endDate, 400)
      const affected = expandBlockOccurrences(data, booking.startDate, booking.endDate)
      if (!affected.length)
        throw new Error("The selected booking does not overlap the weekly Bar block.")
      for (const occurrence of affected) {
        exceptions.push({ occurrenceStart: occurrence.occurrenceStart })
        const pieces = [
          { side: "before", startDate: occurrence.startDate, endDate: booking.startDate },
          { side: "after", startDate: booking.endDate, endDate: occurrence.endDate },
        ]
        for (const piece of pieces) {
          if (piece.startDate >= piece.endDate) continue
          replacements.push({
            ...data,
            id: `${blockId}:${occurrence.occurrenceStart.getTime()}:${piece.side}`,
            startDate: piece.startDate,
            endDate: piece.endDate,
            frequency: "NONE",
            reason: "Weekly party block, adjusted once to preserve an existing reservation.",
          })
        }
      }
    }

    // Check every remaining occurrence and replacement against all saved bookings.
    // No blanket conflict bypass or booking status/date changes are permitted.
    await assertBlockPreservesBookings(tx, itemId, item.totalQuantity, { ...data, exceptions })
    for (const replacement of replacements)
      await assertBlockPreservesBookings(tx, itemId, item.totalQuantity, replacement)
    if (apply) {
      await tx.recurringBlock.create({
        data: { ...data, exceptions: { create: exceptions } },
      })
      if (replacements.length) await tx.recurringBlock.createMany({ data: replacements })
    }
    return {
      status: apply ? "restored" : "dry run passed",
      schedule: "Friday 14:00 to Saturday 14:00",
      timeZone: BLOCK_TIME_ZONE,
      repeatUntil: null,
      preservedBooking: preserveBookingId ?? null,
      skippedOccurrences: exceptions.map(({ occurrenceStart }) => occurrenceStart.toISOString()),
      replacementBlocks: replacements.map(({ startDate, endDate }) => ({ startDate, endDate })),
    }
  })
}
