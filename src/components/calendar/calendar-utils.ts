import { addDays, differenceInMinutes, endOfWeek, format, startOfDay, startOfWeek } from "date-fns"
import { de, enUS } from "date-fns/locale"
import type { CalendarBooking } from "./types"

export const calendarLocale = (locale: string) => (locale === "de" ? de : enUS)

export function weekLabel(date: Date, locale: string) {
  const options = { locale: calendarLocale(locale) }
  return `${format(startOfWeek(date), "d MMM yyyy", options)} – ${format(endOfWeek(date), "d MMM yyyy", options)}`
}

export function bookingsForDay(bookings: CalendarBooking[], day: Date) {
  const start = startOfDay(day)
  const end = addDays(start, 1)
  return bookings
    .filter((booking) => new Date(booking.startDate) < end && new Date(booking.endDate) > start)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
}

export const START_HOUR = 6
export const END_HOUR = 24
export const HOUR_HEIGHT = 64
export const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => index + START_HOUR)

/** Lay out overlapping rentals side by side, keeping the existing 06:00–24:00 time window. */
export function positionedBookings(bookings: CalendarBooking[], day: Date) {
  const midnight = startOfDay(day)
  const events = bookingsForDay(bookings, day)
    .map((booking) => ({
      booking,
      start: Math.max(
        0,
        differenceInMinutes(new Date(booking.startDate), midnight) - START_HOUR * 60,
      ),
      end: Math.min(
        (END_HOUR - START_HOUR) * 60,
        differenceInMinutes(new Date(booking.endDate), midnight) - START_HOUR * 60,
      ),
      column: 0,
      columns: 1,
    }))
    .filter((event) => event.end > event.start)

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
