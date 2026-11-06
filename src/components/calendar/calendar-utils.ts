import { addDays, endOfWeek, isSameDay, startOfDay, startOfWeek } from "date-fns"
import { de, enUS } from "date-fns/locale"
import type { CalendarBooking } from "./types"
import {
  berlinContext,
  combineBerlinDateAndTime,
  formatInBerlin as format,
  toBerlinDate,
} from "@/lib/berlin-time"

export const calendarLocale = (locale: string) => (locale === "de" ? de : enUS)
export const calendarWeekOptions = { ...berlinContext, weekStartsOn: 1 } as const
export const isCalendarToday = (date: Date) => isSameDay(date, toBerlinDate(), berlinContext)

export function weekLabel(date: Date, locale: string) {
  const options = { locale: calendarLocale(locale) }
  return `${format(startOfWeek(date, calendarWeekOptions), "d MMM yyyy", options)} – ${format(endOfWeek(date, calendarWeekOptions), "d MMM yyyy", options)}`
}

export function bookingsForDay(bookings: CalendarBooking[], day: Date) {
  const start = startOfDay(day, berlinContext)
  const end = addDays(start, 1, berlinContext)
  return bookings
    .filter((booking) => new Date(booking.startDate) < end && new Date(booking.endDate) > start)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
}

export const START_HOUR = 0
export const END_HOUR = 24
export const HOUR_HEIGHT = 64
export const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => index + START_HOUR)

/** A labelled clock hour is not an elapsed-hour offset on daylight-saving days. */
export function calendarHour(day: Date, hour: number): Date | null {
  try {
    return toBerlinDate(combineBerlinDateAndTime(day, `${hour.toString().padStart(2, "0")}:00`))
  } catch {
    return null
  }
}

const clockMinutes = (date: Date) =>
  date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60

export function bookingMinutesForDay(booking: CalendarBooking, day: Date) {
  const midnight = startOfDay(day, berlinContext)
  const nextMidnight = addDays(midnight, 1, berlinContext)
  const startsAt = toBerlinDate(booking.startDate)
  const endsAt = toBerlinDate(booking.endDate)
  if (startsAt >= nextMidnight || endsAt <= midnight || endsAt <= startsAt) return null
  const start = startsAt < midnight ? 0 : clockMinutes(startsAt)
  const end = endsAt >= nextMidnight ? 24 * 60 : clockMinutes(endsAt)
  // During the repeated autumn hour, a valid interval may end at an earlier clock time.
  // Keep it visible and selectable in the single 24-hour grid.
  return { start, end: Math.max(start + 1, end) }
}

/** Lay out overlapping rentals side by side across the complete calendar day. */
export function positionedBookings(bookings: CalendarBooking[], day: Date) {
  const events = bookingsForDay(bookings, day)
    .flatMap((booking) => {
      const minutes = bookingMinutesForDay(booking, day)
      return minutes ? [{ booking, ...minutes, column: 0, columns: 1 }] : []
    })
    .sort((a, b) => a.start - b.start)

  let group: typeof events = []
  let columnEnds: number[] = []
  let groupEnd = -1
  const finishGroup = () => {
    group.forEach((event) => {
      event.columns = columnEnds.length
    })
  }
  for (const event of events) {
    if (event.start >= groupEnd) {
      finishGroup()
      group = []
      columnEnds = []
    }
    const available = columnEnds.findIndex((end) => end <= event.start)
    event.column = available === -1 ? columnEnds.length : available
    columnEnds[event.column] = event.end
    group.push(event)
    groupEnd = Math.max(event.end, group.length === 1 ? -1 : groupEnd)
  }
  finishGroup()
  return events
}
