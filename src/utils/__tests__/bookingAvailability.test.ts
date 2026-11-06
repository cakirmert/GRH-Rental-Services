import { describe, expect, it } from "vitest"
import { atLocalMinutes, localMinutesFromDay, peakReservedQuantity } from "../bookingAvailability"
import { berlinDateFromParts } from "@/lib/berlin-time"

const day = berlinDateFromParts(2027, 2, 28)
const at = (hour: number) => atLocalMinutes(day, hour * 60)
const interval = (start: number, end: number, quantity = 1) => ({
  startDate: at(start),
  endDate: at(end),
  quantity,
})

describe("displayed inventory availability", () => {
  it("uses peak simultaneous quantity for separate and overlapping reservations", () => {
    expect(peakReservedQuantity([interval(9, 10), interval(11, 12)], at(8), at(14))).toBe(1)
    expect(peakReservedQuantity([interval(9, 11), interval(10, 12, 2)], at(8), at(14))).toBe(3)
  })
  it("clips to the selected period and treats touching endpoints as available", () => {
    expect(peakReservedQuantity([interval(8, 10, 3), interval(9, 11)], at(10), at(12))).toBe(1)
    expect(peakReservedQuantity([interval(8, 10), interval(12, 14)], at(10), at(12))).toBe(0)
    expect(peakReservedQuantity([interval(9, 10), interval(10, 11)], at(8), at(12))).toBe(1)
  })
  it("constructs and positions wall-clock hours on daylight-saving dates", () => {
    for (const date of [berlinDateFromParts(2027, 2, 28), berlinDateFromParts(2027, 9, 31)]) {
      const selected = atLocalMinutes(date, 14 * 60)
      expect(selected.getHours()).toBe(14)
      expect(localMinutesFromDay(selected, date)).toBe(14 * 60)
    }
  })
})
