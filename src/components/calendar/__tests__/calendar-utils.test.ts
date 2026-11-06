import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  bookingMinutesForDay,
  bookingsForDay,
  calendarHour,
  positionedBookings,
  weekLabel,
} from "../calendar-utils"
import type { CalendarBooking } from "../types"
import { berlinDateFromParts as berlinDate } from "@/lib/berlin-time"

beforeEach(() => vi.stubEnv("TZ", "America/New_York"))
afterEach(() => vi.unstubAllEnvs())

const booking = (id: string, start: Date, end: Date): CalendarBooking => ({
  id,
  startDate: start,
  endDate: end,
  status: "ACCEPTED",
  notes: null,
  item: null,
  user: null,
})

describe("calendar clock changes", () => {
  it.each([
    ["spring", 2, 28],
    ["autumn", 9, 31],
  ] as const)(
    "keeps afternoon bookings and slots at their labelled hour after the %s clock change",
    (_name, month, date) => {
      const day = berlinDate(2027, month, date)
      const start = berlinDate(2027, month, date, 14)
      const end = berlinDate(2027, month, date, 15)
      expect(day.getTimezoneOffset()).not.toBe(start.getTimezoneOffset())
      expect(bookingMinutesForDay(booking("afternoon", start, end), day)).toEqual({
        start: 14 * 60,
        end: 15 * 60,
      })
      expect(calendarHour(day, 14)).toEqual(start)
      expect(
        bookingMinutesForDay(booking("whole-day", day, berlinDate(2027, month, date + 1)), day),
      ).toEqual({ start: 0, end: 24 * 60 })
    },
  )

  it("does not invent a selectable spring-forward hour", () => {
    expect(calendarHour(berlinDate(2027, 2, 28), 2)).toBeNull()
    expect(calendarHour(berlinDate(2027, 2, 28), 3)?.getHours()).toBe(3)
  })

  it("selects the earlier Berlin occurrence of the repeated autumn hour in a foreign timezone", () => {
    expect(calendarHour(new Date("2027-10-31T12:00:00Z"), 2)?.getTime()).toBe(
      Date.parse("2027-10-31T00:00:00.000Z"),
    )
  })

  it("keeps a booking within the repeated autumn hour visible", () => {
    const event = booking(
      "repeated-hour",
      new Date("2027-10-31T02:30:00+02:00"),
      new Date("2027-10-31T02:15:00+01:00"),
    )
    const position = positionedBookings([event], berlinDate(2027, 9, 31))[0]
    expect(position?.start).toBe(150)
    expect(position?.end).toBeGreaterThan(position!.start)
  })
})

describe("calendar booking intervals", () => {
  it("groups and positions an overnight booking by Berlin dates even when both instants are Sunday in New York", () => {
    const event = booking(
      "cross-midnight",
      new Date("2026-11-08T22:30:00Z"),
      new Date("2026-11-08T23:30:00Z"),
    )
    const sunday = new Date("2026-11-08T12:00:00Z")
    const monday = new Date("2026-11-09T12:00:00Z")
    expect(bookingsForDay([event], sunday)).toEqual([event])
    expect(bookingsForDay([event], monday)).toEqual([event])
    expect(bookingMinutesForDay(event, sunday)).toEqual({ start: 23 * 60 + 30, end: 24 * 60 })
    expect(bookingMinutesForDay(event, monday)).toEqual({ start: 0, end: 30 })
    expect(weekLabel(new Date("2026-11-08T23:30:00Z"), "en")).toBe("9 Nov 2026 – 15 Nov 2026")
  })

  it("includes overnight rentals on both days, but excludes a midnight return from the next day", () => {
    const overnight = booking("overnight", berlinDate(2026, 10, 5, 22), berlinDate(2026, 10, 6, 9))
    const midnight = booking("midnight", berlinDate(2026, 10, 5, 20), berlinDate(2026, 10, 6))
    expect(bookingsForDay([overnight, midnight], berlinDate(2026, 10, 5)).map((b) => b.id)).toEqual(
      ["midnight", "overnight"],
    )
    expect(bookingsForDay([overnight, midnight], berlinDate(2026, 10, 6)).map((b) => b.id)).toEqual(
      ["overnight"],
    )
  })

  it("uses separate columns for overlapping bookings and reuses space when rentals only touch", () => {
    const events = [
      booking("first", berlinDate(2026, 10, 5, 8), berlinDate(2026, 10, 5, 10)),
      booking("second", berlinDate(2026, 10, 5, 9), berlinDate(2026, 10, 5, 11)),
      booking("third", berlinDate(2026, 10, 5, 10), berlinDate(2026, 10, 5, 12)),
      booking("later", berlinDate(2026, 10, 5, 12), berlinDate(2026, 10, 5, 13)),
    ]
    expect(
      positionedBookings(events, berlinDate(2026, 10, 5)).map((event) => [
        event.booking.id,
        event.column,
        event.columns,
      ]),
    ).toEqual([
      ["first", 0, 2],
      ["second", 1, 2],
      ["third", 0, 2],
      ["later", 0, 1],
    ])
    expect(events.map((event) => event.id)).toEqual(["first", "second", "third", "later"])
  })

  it("clips multi-day events to the complete calendar day", () => {
    const event = booking("long", berlinDate(2026, 10, 4, 20), berlinDate(2026, 10, 6, 9))
    expect(positionedBookings([event], berlinDate(2026, 10, 5))[0]).toMatchObject({
      start: 0,
      end: 24 * 60,
    })
  })

  it("labels both years when the displayed week crosses New Year", () => {
    expect(weekLabel(berlinDate(2026, 11, 31), "en")).toBe("28 Dec 2026 – 3 Jan 2027")
  })

  it("keeps Sunday in the preceding Monday-based week in either language", () => {
    expect(weekLabel(berlinDate(2027, 0, 3), "en")).toBe("28 Dec 2026 – 3 Jan 2027")
    expect(weekLabel(berlinDate(2027, 0, 3), "de")).toBe("28 Dez. 2026 – 3 Jan. 2027")
  })
})
