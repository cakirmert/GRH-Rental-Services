import { describe, expect, it } from "vitest"
import {
  BLOCK_TIME_ZONE,
  expandBlockOccurrences,
  formatBerlinDateTime,
  isBlockOccurrence,
  parseBerlinDateTime,
  validateBlockRecurrence,
  type BlockRecurrenceSpec,
} from "../recurring-blocks"

const date = parseBerlinDateTime
const weekly = (overrides: Partial<BlockRecurrenceSpec> = {}): BlockRecurrenceSpec => ({
  startDate: date("2026-11-06T14:00"),
  endDate: date("2026-11-07T12:00"),
  frequency: "WEEKLY",
  timeZone: BLOCK_TIME_ZONE,
  quantity: 1,
  ...overrides,
})

describe("Berlin recurring blocks", () => {
  it("preserves Friday/Saturday local hours across both daylight-saving changes", () => {
    const spring = expandBlockOccurrences(
      weekly(),
      date("2027-03-21T00:00"),
      date("2027-04-08T00:00"),
    )
    expect(spring.map((event) => event.startDate.toISOString())).toEqual([
      "2027-03-26T13:00:00.000Z",
      "2027-04-02T12:00:00.000Z",
    ])
    expect(spring.map((event) => formatBerlinDateTime(event.endDate))).toEqual([
      "2027-03-27T12:00",
      "2027-04-03T12:00",
    ])
    const autumn = expandBlockOccurrences(
      weekly(),
      date("2027-10-29T00:00"),
      date("2027-11-07T00:00"),
    )
    expect(autumn.map((event) => event.startDate.toISOString())).toEqual([
      "2027-10-29T12:00:00.000Z",
      "2027-11-05T13:00:00.000Z",
    ])
  })

  it("keeps an indefinite schedule decades later, without creating 52 bookings", () => {
    const events = expandBlockOccurrences(
      weekly(),
      date("2099-01-01T00:00"),
      date("2100-01-01T00:00"),
    )
    expect(events.length).toBeGreaterThanOrEqual(52)
    expect(
      events.every(
        (event) =>
          new Intl.DateTimeFormat("en", { timeZone: BLOCK_TIME_ZONE, weekday: "long" }).format(
            event.startDate,
          ) === "Friday",
      ),
    ).toBe(true)
  })

  it("includes an overnight block that starts before the displayed day, with half-open boundaries", () => {
    expect(
      expandBlockOccurrences(weekly(), date("2026-11-07T00:00"), date("2026-11-08T00:00")),
    ).toHaveLength(1)
    expect(
      expandBlockOccurrences(weekly(), date("2026-11-07T12:00"), date("2026-11-13T14:00")),
    ).toHaveLength(0)
  })

  it("applies an inclusive local end date, single-date exceptions, and an effective series stop", () => {
    const block = weekly({
      until: date("2026-11-27T00:00"),
      exceptions: [{ occurrenceStart: date("2026-11-13T14:00") }],
      stoppedFrom: date("2026-11-27T14:00"),
    })
    expect(
      expandBlockOccurrences(block, date("2026-11-01T00:00"), date("2026-12-10T00:00")).map(
        (event) => formatBerlinDateTime(event.startDate),
      ),
    ).toEqual(["2026-11-06T14:00", "2026-11-20T14:00"])
    expect(
      expandBlockOccurrences(
        { ...block, stoppedFrom: null },
        date("2026-11-27T00:00"),
        date("2026-12-10T00:00"),
      ),
    ).toHaveLength(1)
    expect(isBlockOccurrence(block, date("2026-11-13T14:00"))).toBe(true)
    expect(isBlockOccurrence(block, date("2026-11-13T15:00"))).toBe(false)
  })

  it("anchors monthly dates to the original day rather than drifting after February", () => {
    const block = weekly({
      frequency: "MONTHLY",
      startDate: date("2027-01-31T10:00"),
      endDate: date("2027-01-31T12:00"),
    })
    expect(
      expandBlockOccurrences(block, date("2027-01-01T00:00"), date("2027-05-01T00:00")).map(
        (event) => formatBerlinDateTime(event.startDate),
      ),
    ).toEqual(["2027-01-31T10:00", "2027-02-28T10:00", "2027-03-31T10:00", "2027-04-30T10:00"])
  })

  it("supports a one-off block and two-week intervals", () => {
    expect(
      expandBlockOccurrences(
        weekly({ frequency: "NONE" }),
        date("2026-11-01T00:00"),
        date("2026-12-01T00:00"),
      ),
    ).toHaveLength(1)
    expect(
      expandBlockOccurrences(
        weekly({ frequency: "BIWEEKLY" }),
        date("2026-11-01T00:00"),
        date("2026-12-01T00:00"),
      ).map((event) => formatBerlinDateTime(event.startDate)),
    ).toEqual(["2026-11-06T14:00", "2026-11-20T14:00"])
  })

  it("moves a future nonexistent spring time forward without dropping a short block", () => {
    const block = weekly({
      frequency: "DAILY",
      startDate: date("2027-03-27T02:30"),
      endDate: date("2027-03-27T03:00"),
    })
    const events = expandBlockOccurrences(block, date("2027-03-28T00:00"), date("2027-03-29T00:00"))
    expect(events).toHaveLength(1)
    expect(formatBerlinDateTime(events[0].startDate)).toBe("2027-03-28T03:30")
    expect(formatBerlinDateTime(events[0].endDate)).toBe("2027-03-28T04:00")
  })

  it("uses one occurrence in an autumn repeated hour", () => {
    const block = weekly({
      frequency: "DAILY",
      startDate: date("2027-10-30T02:30"),
      endDate: date("2027-10-30T03:30"),
    })
    const events = expandBlockOccurrences(block, date("2027-10-31T00:00"), date("2027-11-01T00:00"))
    expect(events).toHaveLength(1)
    expect(events[0].startDate.toISOString()).toBe("2027-10-31T00:30:00.000Z")
  })

  it.each([
    "2027-03-28T02:30",
    "2027-02-30T12:00",
    "2027-01-01T25:00",
    "2027-01-01T10:80",
    "invalid",
    "2027-01-01T10:00Z",
  ])("rejects invalid or nonexistent form time %s", (value) => expect(() => date(value)).toThrow())

  it("bounds expansion and rejects invalid schedules", () => {
    expect(() =>
      expandBlockOccurrences(weekly(), date("2026-01-01T00:00"), date("2028-01-01T00:00")),
    ).toThrow()
    for (const override of [
      { frequency: "INVALID" },
      { quantity: 0 },
      { timeZone: "UTC" },
      { endDate: date("2026-11-06T13:00") },
      { frequency: "DAILY", endDate: date("2026-11-08T12:00") },
      { until: date("2026-11-05T14:00") },
    ])
      expect(() => validateBlockRecurrence(weekly(override))).toThrow()
  })
})
