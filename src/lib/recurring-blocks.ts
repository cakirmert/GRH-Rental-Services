import { TZDate } from "@date-fns/tz"
import { BERLIN_TIME_ZONE, berlinDateFromParts } from "./berlin-time"
export { formatBerlinDateTime, parseBerlinDateTime } from "./berlin-time"

export const BLOCK_TIME_ZONE = BERLIN_TIME_ZONE
const DAY = 86_400_000
const frequencies = ["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const
export type BlockFrequency = (typeof frequencies)[number]

export interface BlockRecurrenceSpec {
  startDate: Date
  endDate: Date
  frequency: string
  timeZone?: string
  until?: Date | null
  stoppedFrom?: Date | null
  quantity: number
  exceptions?: ReadonlyArray<{ occurrenceStart: Date }>
}

export interface BlockOccurrence {
  occurrenceStart: Date
  startDate: Date
  endDate: Date
  quantity: number
}

const inBerlin = (date: Date) => new TZDate(date.getTime(), BLOCK_TIME_ZONE)
const validDate = (date: Date) => date instanceof Date && Number.isFinite(date.getTime())
const localDay = (date: TZDate) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY
const localClock = (date: TZDate) =>
  ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 +
  date.getMilliseconds()

export function validateBlockRecurrence(block: BlockRecurrenceSpec): void {
  if (block.timeZone && block.timeZone !== BLOCK_TIME_ZONE)
    throw new Error("Use Europe/Berlin time.")
  if (!frequencies.includes(block.frequency as BlockFrequency))
    throw new Error("Invalid recurrence.")
  if (
    !validDate(block.startDate) ||
    !validDate(block.endDate) ||
    block.endDate <= block.startDate
  ) {
    throw new Error("The block must end after it starts.")
  }
  if (!Number.isInteger(block.quantity) || block.quantity < 1)
    throw new Error("Invalid block quantity.")
  const start = inBerlin(block.startDate)
  const end = inBerlin(block.endDate)
  const wallDuration = (localDay(end) - localDay(start)) * DAY + localClock(end) - localClock(start)
  const maximumDays = { NONE: 31, DAILY: 1, WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 28 }[
    block.frequency as BlockFrequency
  ]
  if (wallDuration <= 0 || wallDuration > maximumDays * DAY) {
    throw new Error(
      `A ${block.frequency.toLowerCase()} block cannot span more than ${maximumDays} days or overlap its next occurrence.`,
    )
  }
  if (
    block.until &&
    (!validDate(block.until) || localDay(inBerlin(block.until)) < localDay(start))
  ) {
    throw new Error("The recurrence end date cannot precede the first block.")
  }
  if (block.stoppedFrom && !validDate(block.stoppedFrom)) throw new Error("Invalid series end.")
}

function dateOnDay(day: number, clock: TZDate): Date {
  const civil = new Date(day * DAY)
  // Compatible timezone disambiguation: future missing spring times move forward;
  // an autumn repeated time selects one occurrence, never two copies of the block.
  return new Date(
    berlinDateFromParts(
      civil.getUTCFullYear(),
      civil.getUTCMonth(),
      civil.getUTCDate(),
      clock.getHours(),
      clock.getMinutes(),
      clock.getSeconds(),
      clock.getMilliseconds(),
    ).getTime(),
  )
}

/** Expands only the requested window, jumping directly to it even decades into a series. */
export function expandBlockOccurrences(
  block: BlockRecurrenceSpec,
  from: Date,
  to: Date,
): BlockOccurrence[] {
  validateBlockRecurrence(block)
  if (
    !validDate(from) ||
    !validDate(to) ||
    to <= from ||
    to.getTime() - from.getTime() > 400 * DAY
  ) {
    throw new Error("Select a valid block window of at most 400 days.")
  }
  const anchor = inBerlin(block.startDate)
  const endAnchor = inBerlin(block.endDate)
  const anchorDay = localDay(anchor)
  const endDayOffset = localDay(endAnchor) - anchorDay
  const firstVisibleDay = localDay(inBerlin(from)) - endDayOffset - 2
  const lastVisibleDay = localDay(inBerlin(to)) + 1
  const untilDay = block.until ? localDay(inBerlin(block.until)) : Infinity
  const excluded = new Set(
    block.exceptions?.map((exception) => exception.occurrenceStart.getTime()),
  )
  const period = { NONE: 0, DAILY: 1, WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 0 }[
    block.frequency as BlockFrequency
  ]
  const monthly = block.frequency === "MONTHLY"
  let index = 0
  if (monthly) {
    const earliest = new Date(firstVisibleDay * DAY)
    index = Math.max(
      0,
      (earliest.getUTCFullYear() - anchor.getFullYear()) * 12 +
        earliest.getUTCMonth() -
        anchor.getMonth() -
        1,
    )
  } else if (period) {
    index = Math.max(0, Math.floor((firstVisibleDay - anchorDay) / period))
  }
  const result: BlockOccurrence[] = []
  // At most 400 daily occurrences plus look-behind for a bounded block duration.
  for (let attempts = 0; attempts < 440; attempts++, index++) {
    let day = anchorDay + index * period
    if (monthly) {
      const monthStart = new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth() + index, 1))
      const daysInMonth = new Date(
        Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
      ).getUTCDate()
      day =
        Date.UTC(
          monthStart.getUTCFullYear(),
          monthStart.getUTCMonth(),
          Math.min(anchor.getDate(), daysInMonth),
        ) / DAY
    }
    if (day > lastVisibleDay || day > untilDay) return result
    const startDate = index === 0 ? new Date(block.startDate) : dateOnDay(day, anchor)
    let endDate = index === 0 ? new Date(block.endDate) : dateOnDay(day + endDayOffset, endAnchor)
    // A spring-gap start can shift past a short block's nominal end. Keep its
    // wall-clock duration in that case instead of silently losing the restriction.
    if (endDate <= startDate) {
      endDate = new Date(
        startDate.getTime() + endDayOffset * DAY + localClock(endAnchor) - localClock(anchor),
      )
    }
    if (block.stoppedFrom && startDate >= block.stoppedFrom) return result
    if (
      startDate < to &&
      endDate > from &&
      endDate > startDate &&
      !excluded.has(startDate.getTime())
    ) {
      result.push({ occurrenceStart: startDate, startDate, endDate, quantity: block.quantity })
    }
    if (block.frequency === "NONE") return result
  }
  throw new Error("The recurrence window is too large.")
}

/** Checks the original occurrence key, including one already excluded or stopped (idempotent cancellation). */
export function isBlockOccurrence(block: BlockRecurrenceSpec, start: Date): boolean {
  if (!validDate(start)) return false
  return expandBlockOccurrences(
    { ...block, stoppedFrom: null, exceptions: [] },
    start,
    new Date(start.getTime() + 1),
  ).some((occurrence) => occurrence.startDate.getTime() === start.getTime())
}
