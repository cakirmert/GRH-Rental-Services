import { describe, expect, it } from "vitest"
import { addDays, startOfDay } from "date-fns"
import {
  combineBerlinDateAndTime,
  formatInBerlin,
  parseBerlinDateTime,
  toBerlinDate,
} from "../berlin-time"

describe("site-wide Berlin time", () => {
  it("keeps 14:00 local in winter and summer while using the correct UTC offset", () => {
    const winter = combineBerlinDateAndTime(toBerlinDate("2027-01-08T12:00:00Z"), "14:00")
    const summer = combineBerlinDateAndTime(toBerlinDate("2027-07-09T12:00:00Z"), "14:00")
    expect(winter.toISOString()).toBe("2027-01-08T13:00:00.000Z")
    expect(summer.toISOString()).toBe("2027-07-09T12:00:00.000Z")
    expect(formatInBerlin(winter, "HH:mm")).toBe("14:00")
    expect(formatInBerlin(summer, "HH:mm")).toBe("14:00")
  })
  it("uses the Berlin day around midnight, independently of the computer timezone", () => {
    const day = toBerlinDate("2027-01-07T23:30:00Z")
    expect(formatInBerlin(day, "yyyy-MM-dd HH:mm")).toBe("2027-01-08 00:30")
    expect(startOfDay(day).toISOString()).toBe("2027-01-08T00:00:00.000+01:00")
    expect(combineBerlinDateAndTime(day, "14:00").toISOString()).toBe("2027-01-08T13:00:00.000Z")
  })
  it("keeps calendar days across 23-hour and 25-hour daylight-saving days", () => {
    for (const [value, hours] of [
      ["2027-03-28T00:00", 23],
      ["2027-10-31T00:00", 25],
    ] as const) {
      const start = toBerlinDate(parseBerlinDateTime(value))
      const end = addDays(start, 1)
      expect((end.getTime() - start.getTime()) / 3600000).toBe(hours)
      expect(end.getHours()).toBe(0)
    }
  })
  it("rejects a skipped spring clock time instead of moving the user's booking", () => {
    expect(() => parseBerlinDateTime("2027-03-28T02:30")).toThrow("does not exist")
    expect(() => parseBerlinDateTime("2027-02-30T14:00")).toThrow("does not exist")
  })
  it("chooses the first autumn repeated hour consistently on every host timezone", () => {
    expect(parseBerlinDateTime("2027-10-31T02:30").toISOString()).toBe("2027-10-31T00:30:00.000Z")
  })
})
