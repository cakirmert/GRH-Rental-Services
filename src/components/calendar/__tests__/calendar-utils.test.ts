import { describe, expect, it } from "vitest"
import { bookingsForDay, positionedBookings, weekLabel } from "../calendar-utils"
import type { CalendarBooking } from "../types"

const booking = (id: string, start: Date, end: Date): CalendarBooking => ({
  id,
  startDate: start,
  endDate: end,
  status: "ACCEPTED",
  notes: null,
  item: null,
  user: null,
})

describe("calendar booking intervals", () => {
  it("includes overnight rentals on both days, but excludes a midnight return from the next day", () => {
    const overnight = booking("overnight", new Date(2026, 10, 5, 22), new Date(2026, 10, 6, 9))
    const midnight = booking("midnight", new Date(2026, 10, 5, 20), new Date(2026, 10, 6))
    expect(bookingsForDay([overnight, midnight], new Date(2026, 10, 5)).map((b) => b.id)).toEqual([
      "midnight",
      "overnight",
    ])
    expect(bookingsForDay([overnight, midnight], new Date(2026, 10, 6)).map((b) => b.id)).toEqual([
      "overnight",
    ])
  })

  it("uses separate columns for overlapping bookings and reuses space when rentals only touch", () => {
    const events = [
      booking("first", new Date(2026, 10, 5, 8), new Date(2026, 10, 5, 10)),
      booking("second", new Date(2026, 10, 5, 9), new Date(2026, 10, 5, 11)),
      booking("third", new Date(2026, 10, 5, 10), new Date(2026, 10, 5, 12)),
      booking("later", new Date(2026, 10, 5, 12), new Date(2026, 10, 5, 13)),
    ]
    expect(
      positionedBookings(events, new Date(2026, 10, 5)).map((event) => [
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

  it("clips multi-day events to the existing timetable window", () => {
    const event = booking("long", new Date(2026, 10, 4, 20), new Date(2026, 10, 6, 9))
    expect(positionedBookings([event], new Date(2026, 10, 5))[0]).toMatchObject({
      start: 0,
      end: 18 * 60,
    })
  })

  it("labels both years when the displayed week crosses New Year", () => {
    expect(weekLabel(new Date(2026, 11, 31), "en")).toBe("27 Dec 2026 – 2 Jan 2027")
  })
})
