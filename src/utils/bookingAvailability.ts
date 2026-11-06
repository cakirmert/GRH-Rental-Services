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

/** Prefer a fully available period; if the dates cannot work, keep each handle
 * outside occupied time so the conflict can be explained without a misleading default. */
export function availableTimeDefaults(
  intervals: ReadonlyArray<{ startDate: Date; endDate: Date; quantity: number }>,
  options: {
    from: Date
    to?: Date
    totalQuantity: number
    preferredStart: number
    preferredEnd: number
    min: number
    max: number
    step: number
  },
): { start: number | null; end: number | null; rangeAvailable: boolean } {
  const { from, to = from, totalQuantity, preferredStart, preferredEnd, min, max, step } = options
  if (totalQuantity <= 0) return { start: null, end: null, rangeAvailable: false }
  const multiDay = differenceInCalendarDays(to, from, berlinContext) > 0
  const events = intervals
    .flatMap((interval) => [
      { at: interval.startDate.getTime(), delta: interval.quantity },
      { at: interval.endDate.getTime(), delta: -interval.quantity },
    ])
    .sort((a, b) => a.at - b.at)
  const full: Array<{ start: number; end: number }> = []
  let reserved = 0
  let fullStart = 0
  for (let index = 0; index < events.length;) {
    const at = events[index].at
    const wasFull = reserved >= totalQuantity
    while (index < events.length && events[index].at === at) reserved += events[index++].delta
    if (!wasFull && reserved >= totalQuantity) fullStart = at
    if (wasFull && reserved < totalQuantity) full.push({ start: fullStart, end: at })
  }
  const isFree = (start: number, end: number) =>
    !full.some((block) => block.start < end && block.end > start)
  const fromInstants = new Map<number, number>()
  const toInstants = multiDay ? new Map<number, number>() : fromInstants
  const instant = (day: Date, cache: Map<number, number>, minutes: number) => {
    if (!cache.has(minutes)) cache.set(minutes, atLocalMinutes(day, minutes).getTime())
    return cache.get(minutes)!
  }
  const fromAt = (minutes: number) => instant(from, fromInstants, minutes)
  const toAt = (minutes: number) => instant(to, toInstants, minutes)
  const starts: number[] = []
  const ends: number[] = []
  for (let minutes = min; minutes <= max; minutes += step) {
    if (minutes < max && isFree(fromAt(minutes), fromAt(minutes + step))) starts.push(minutes)
    if ((multiDay || minutes > min) && isFree(toAt(minutes - step), toAt(minutes)))
      ends.push(minutes)
  }
  starts.sort((a, b) => Math.abs(a - preferredStart) - Math.abs(b - preferredStart) || b - a)
  ends.sort((a, b) => Math.abs(a - preferredEnd) - Math.abs(b - preferredEnd) || a - b)
  let best: { start: number; end: number; distance: number } | undefined
  let sameDuration: typeof best
  const preferredDuration = toAt(preferredEnd) - fromAt(preferredStart)
  for (const start of starts) {
    const startAt = fromAt(start)
    for (const end of ends) {
      const endAt = toAt(end)
      if (endAt <= startAt || !isFree(startAt, endAt)) continue
      const distance = Math.abs(start - preferredStart) + Math.abs(end - preferredEnd)
      if (!best || distance < best.distance) best = { start, end, distance }
      if (
        preferredDuration > 0 &&
        endAt - startAt === preferredDuration &&
        (!sameDuration || distance < sameDuration.distance)
      )
        sameDuration = { start, end, distance }
      if (distance === 0) return { start, end, rangeAvailable: true }
    }
  }
  const selection = sameDuration ?? best
  return selection
    ? { start: selection.start, end: selection.end, rangeAvailable: true }
    : { start: starts[0] ?? null, end: ends[0] ?? null, rangeAvailable: false }
}
