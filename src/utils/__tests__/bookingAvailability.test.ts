import { describe, expect, it } from "vitest"
import {
  atLocalMinutes,
  localMinutesFromDay,
  peakReservedQuantity,
  availableTimeDefaults,
} from "../bookingAvailability"
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

describe("available default times", () => {
  const options = {
    from: day,
    totalQuantity: 1,
    preferredStart: 14 * 60,
    preferredEnd: 16 * 60,
    min: 8 * 60,
    max: 22 * 60,
    step: 15,
  }

  it("moves a same-day request before booked time and retains its duration", () => {
    expect(availableTimeDefaults([interval(14, 18)], options)).toEqual({
      start: 12 * 60,
      end: 14 * 60,
      rangeAvailable: true,
    })
  })

  it("moves both overnight endpoints to keep the whole request outside a booking", () => {
    const next = berlinDateFromParts(2027, 2, 29)
    const intervals = [
      interval(12, 15),
      {
        startDate: atLocalMinutes(next, 10 * 60),
        endDate: atLocalMinutes(next, 18 * 60),
        quantity: 1,
      },
    ]
    const result = availableTimeDefaults(intervals, { ...options, to: next })
    expect(result.rangeAvailable).toBe(true)
    expect(result.start).toBeGreaterThanOrEqual(15 * 60)
    expect(result.end).toBeLessThanOrEqual(10 * 60)
    expect(
      peakReservedQuantity(
        intervals,
        atLocalMinutes(day, result.start!),
        atLocalMinutes(next, result.end!),
      ),
    ).toBe(0)
  })

  it("keeps the second handle outside a block that crosses midnight, while reporting the impossible period", () => {
    const next = berlinDateFromParts(2027, 2, 29)
    expect(
      availableTimeDefaults(
        [
          {
            startDate: at(14),
            endDate: atLocalMinutes(next, 14 * 60),
            quantity: 1,
          },
        ],
        { ...options, to: next, preferredStart: 8 * 60, preferredEnd: 8 * 60 + 15 },
      ),
    ).toEqual({
      start: 8 * 60,
      end: 14 * 60 + 15,
      rangeAvailable: false,
    })
  })

  it("does not treat partially reserved inventory as fully blocked", () => {
    expect(availableTimeDefaults([interval(8, 22)], { ...options, totalQuantity: 2 })).toEqual({
      start: 14 * 60,
      end: 16 * 60,
      rangeAvailable: true,
    })
  })

  it("returns no default rather than selecting a fully booked day", () => {
    expect(availableTimeDefaults([interval(8, 22)], options)).toEqual({
      start: null,
      end: null,
      rangeAvailable: false,
    })
  })
})
