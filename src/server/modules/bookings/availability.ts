import { BookingStatus, LogType } from "@prisma/client"
import { parseISO } from "date-fns"

import { assertDateRange, bookingTransaction } from "@/server/bookingSecurity"
import { consumeBudget } from "@/lib/auth/state"
import { BLOCK_TIME_ZONE, isBlockOccurrence, validateBlockRecurrence } from "@/lib/recurring-blocks"
import {
  assertBlockPreservesBookings,
  blockOccurrences,
  MAX_BLOCK_RULES_PER_ITEM,
  requireBlockItem,
  requireBlockStaff,
} from "@/server/recurringBlocks"

import { bookingEffects, type BookingEffects } from "./effects"

import { OperationError, type OperationContext, type DatabaseContext } from "../shared/operation"

import type * as contracts from "./contracts"

export async function listBlockableItems(context: OperationContext) {
  const role = await requireBlockStaff(context.db, context.actor.id)
  return context.db.item.findMany({
    where: {
      active: true,
      ...(role === "ADMIN" ? {} : { responsibleMembers: { some: { id: context.actor.id } } }),
    },
    select: { id: true, titleEn: true, titleDe: true, totalQuantity: true },
    orderBy: { titleEn: "asc" },
  })
}

export async function createAvailabilityBlock(
  context: OperationContext,
  input: contracts.CreateAvailabilityBlockInput,
  effects: BookingEffects = bookingEffects,
) {
  const startDate = parseISO(input.start)
  const endDate = parseISO(input.end)
  const frequency = input.recurrence?.frequency ?? "NONE"
  const until = input.recurrence?.until ? parseISO(input.recurrence.until) : null
  const spec = {
    startDate,
    endDate,
    frequency,
    timeZone: BLOCK_TIME_ZONE,
    until,
    stoppedFrom: null,
    quantity: input.quantity ?? 1,
    exceptions: [],
  }
  try {
    validateBlockRecurrence(spec)
  } catch {
    throw new OperationError({
      code: "BAD_REQUEST",
      message:
        "Invalid block dates or recurrence. Use a positive duration within the recurrence period.",
    })
  }

  const result = await bookingTransaction(context.db, async (tx) => {
    const item = await requireBlockItem(tx, context.actor.id, input.itemId)
    if (!item.active)
      throw new OperationError({ code: "BAD_REQUEST", message: "Item is inactive." })
    if (
      !(await consumeBudget("block-create-global", "all", 500, 86400000, tx)) ||
      !(await consumeBudget("block-create-user", context.actor.id, 100, 86400000, tx))
    ) {
      throw new OperationError({
        code: "TOO_MANY_REQUESTS",
        message: "Block creation limit reached. Try again later.",
      })
    }
    const quantity = input.quantity ?? item.totalQuantity
    if (quantity > item.totalQuantity) {
      throw new OperationError({
        code: "BAD_REQUEST",
        message: "Block quantity cannot exceed available quantity.",
      })
    }

    const now = new Date()
    const activeRules = await tx.recurringBlock.count({
      where: {
        itemId: input.itemId,
        AND: [
          { OR: [{ frequency: { not: "NONE" } }, { endDate: { gt: now } }] },
          {
            OR: [{ until: null }, { until: { gte: new Date(now.getTime() - 32 * 86400000) } }],
          },
          { OR: [{ stoppedFrom: null }, { stoppedFrom: { gt: now } }] },
        ],
      },
    })
    if (activeRules >= MAX_BLOCK_RULES_PER_ITEM)
      throw new OperationError({
        code: "CONFLICT",
        message: "This item has too many active block rules. Stop an existing series first.",
      })
    await assertBlockPreservesBookings(tx, input.itemId, item.totalQuantity, {
      ...spec,
      quantity,
    })
    const block = await tx.recurringBlock.create({
      data: {
        itemId: input.itemId,
        createdById: context.actor.id,
        startDate,
        endDate,
        frequency,
        timeZone: BLOCK_TIME_ZONE,
        until,
        quantity,
        reason: input.reason?.trim() || null,
      },
    })
    return {
      id: block.id,
      title: item.titleEn,
      frequency,
      until,
      indefinite: frequency !== "NONE" && !until,
    }
  })
  await effects.recordAudit({
    type: LogType.BOOKING,
    userId: context.actor.id,
    message: `blocked:create:${result.id}`,
  })
  return result
}

export async function cancelBlockOccurrence(
  context: OperationContext,
  input: contracts.CancelBlockOccurrenceInput,
  effects: BookingEffects = bookingEffects,
) {
  await bookingTransaction(context.db, async (tx) => {
    const block = await tx.recurringBlock.findUnique({ where: { id: input.recurringBlockId } })
    if (!block) throw new OperationError({ code: "NOT_FOUND", message: "Block not found." })
    await requireBlockItem(tx, context.actor.id, block.itemId)
    const occurrenceStart = parseISO(input.occurrenceStart)
    if (!isBlockOccurrence(block, occurrenceStart))
      throw new OperationError({
        code: "BAD_REQUEST",
        message: "This occurrence is no longer active.",
      })
    await tx.recurringBlockException.upsert({
      where: { blockId_occurrenceStart: { blockId: block.id, occurrenceStart } },
      create: { blockId: block.id, occurrenceStart },
      update: {},
    })
  })
  await effects.recordAudit({
    type: LogType.BOOKING,
    userId: context.actor.id,
    message: `blocked:cancel:${input.recurringBlockId}:${input.occurrenceStart}`,
  })
  return { success: true }
}

export async function stopBlockSeries(
  context: OperationContext,
  input: contracts.StopBlockSeriesInput,
  effects: BookingEffects = bookingEffects,
) {
  await bookingTransaction(context.db, async (tx) => {
    const block = await tx.recurringBlock.findUnique({ where: { id: input.recurringBlockId } })
    if (!block) throw new OperationError({ code: "NOT_FOUND", message: "Block not found." })
    await requireBlockItem(tx, context.actor.id, block.itemId)
    const occurrenceStart = parseISO(input.occurrenceStart)
    if (!isBlockOccurrence(block, occurrenceStart))
      throw new OperationError({
        code: "BAD_REQUEST",
        message: "This occurrence is no longer active.",
      })
    const stoppedFrom =
      block.stoppedFrom && block.stoppedFrom < occurrenceStart ? block.stoppedFrom : occurrenceStart
    await tx.recurringBlock.update({ where: { id: block.id }, data: { stoppedFrom } })
  })
  await effects.recordAudit({
    type: LogType.BOOKING,
    userId: context.actor.id,
    message: `blocked:stop:${input.recurringBlockId}:${input.occurrenceStart}`,
  })
  return { success: true }
}

export async function getAvailability(
  context: DatabaseContext,
  input: contracts.GetAvailabilityInput,
) {
  const queryStartBoundary = parseISO(input.from)
  const queryEndBoundary = parseISO(input.to)
  assertDateRange(queryStartBoundary, queryEndBoundary, 62)
  const now = Date.now()
  if (
    queryStartBoundary.getTime() < now - 7 * 86400000 ||
    queryEndBoundary.getTime() > now + 400 * 86400000
  ) {
    throw new OperationError({
      code: "BAD_REQUEST",
      message: "Availability is limited to the current booking window.",
    })
  }
  const bookings = await context.db.booking.findMany({
    where: {
      itemId: input.itemId,
      status: {
        in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED],
      },
      AND: [{ startDate: { lt: queryEndBoundary } }, { endDate: { gt: queryStartBoundary } }],
    },
    select: { id: true, startDate: true, endDate: true, status: true, quantity: true },
    take: 1001,
    orderBy: { startDate: "asc" },
  })
  if (bookings.length > 1000)
    throw new OperationError({ code: "BAD_REQUEST", message: "Select a smaller date range." })
  const blocks = await blockOccurrences(context.db, queryStartBoundary, queryEndBoundary, {
    itemId: input.itemId,
  })
  return [
    ...bookings,
    ...blocks.map(({ id, startDate, endDate, status, quantity }) => ({
      id,
      startDate,
      endDate,
      status,
      quantity,
    })),
  ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
}
