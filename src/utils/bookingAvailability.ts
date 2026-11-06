import { differenceInCalendarDays } from "date-fns"
import { toBerlinDate, berlinContext, berlinDateFromParts } from "@/lib/berlin-time"

export function atLocalMinutes(day: Date, minutes: number): Date {
  const date = toBerlinDate(day)
  return berlinDateFromParts(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes)
}

export function localMinutesFromDay(value: Date, day: Date): number {
  const berlin = toBerlinDate(value)
  return (
    differenceInCalendarDays(berlin, toBerlinDate(day), berlinContext) * 1440 +
    berlin.getHours() * 60 +
    berlin.getMinutes()
  )
}

/** Inventory needed simultaneously in the selection, not the sum of separate rentals. */
export function peakReservedQuantity(
  intervals: ReadonlyArray<{ startDate: Date; endDate: Date; quantity: number }>,
  from: Date,
  to: Date,
): number {
  if (to <= from) return 0
  const events = intervals
    .filter((row) => row.startDate < to && row.endDate > from)
    .flatMap((row) => [
      { time: Math.max(from.getTime(), row.startDate.getTime()), delta: row.quantity },
      { time: Math.min(to.getTime(), row.endDate.getTime()), delta: -row.quantity },
    ])
    .sort((a, b) => a.time - b.time || a.delta - b.delta)
  let current = 0
  let maximum = 0
  for (const event of events) {
    current += event.delta
    maximum = Math.max(maximum, current)
  }
  return maximum
}
