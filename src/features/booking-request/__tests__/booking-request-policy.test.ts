import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookingFormSchema, isRoomItem, selectBookingRange } from "../booking-request-policy"

beforeEach(() => vi.stubEnv("TZ", "America/New_York"))
afterEach(() => vi.unstubAllEnvs())

it("caps a range by Berlin calendar days over the spring DST change", () => {
  const from = new Date("2030-03-30T23:00:00Z") // March 31, Berlin midnight.
  const to = new Date("2030-04-03T22:00:00Z")
  const selected = selectBookingRange(undefined, { from, to }, from, 1)
  expect(selected?.from.getTime()).toBe(Date.parse("2030-03-30T23:00:00Z"))
  expect(selected?.to?.getTime()).toBe(Date.parse("2030-03-31T22:00:00Z"))
})

it("clears a selected Berlin endpoint even when the browser's date differs", () => {
  const from = new Date("2030-07-14T22:00:00Z")
  const selected = selectBookingRange(undefined, { from }, from, 1)
  expect(selectBookingRange(selected, { from, to: from }, from, 1)).toBeUndefined()
})

it("reports excessive ranges on the calendar field and room purposes on notes", () => {
  const result = createBookingFormSchema(
    1,
    "Range exceeds the booking window",
    isRoomItem("room"),
  ).safeParse({
    dateRange: { from: new Date("2030-03-30T23:00:00Z"), to: new Date("2030-04-01T22:00:00Z") },
    startTime: "14:00",
    endTime: "15:00",
    quantity: 1,
    notes: "  ",
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.error.issues.map((issue) => issue.path)).toEqual([["dateRange", "to"], ["notes"]])
})
