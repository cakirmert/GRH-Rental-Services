import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { de, enUS } from "date-fns/locale"
import { Calendar } from "../calendar"
import { berlinDateFromParts as berlinDate } from "@/lib/berlin-time"
import userEvent from "@testing-library/user-event"

beforeEach(() => {
  vi.stubEnv("TZ", "America/New_York")
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("shared booking date picker", () => {
  it("uses Berlin today and emits Berlin midnight even if a caller requests another timezone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-08T23:30:00Z"))
    const select = vi.fn()
    render(
      <Calendar mode="single" onSelect={select} timeZone="America/New_York" numberOfMonths={1} />,
    )
    await userEvent.click(screen.getByRole("button", { name: /Today, Monday, November 9th, 2026/ }))
    expect(select.mock.calls[0]?.[0].getTime()).toBe(Date.parse("2026-11-08T23:00:00.000Z"))
  })

  it.each([
    ["English", enUS, "Monday", "Sunday"],
    ["German", de, "Montag", "Sonntag"],
  ] as const)("starts weeks on Monday in %s", (_name, locale, monday, sunday) => {
    render(<Calendar locale={locale} defaultMonth={berlinDate(2026, 10, 1)} numberOfMonths={1} />)
    const weekdays = screen.getAllByRole("columnheader", { hidden: true })
    expect(weekdays[0]?.getAttribute("aria-label")).toBe(monday)
    expect(weekdays[6]?.getAttribute("aria-label")).toBe(sunday)
    // November starts on Sunday: its first row includes the preceding Monday.
    const firstWeek = screen.getAllByRole("row")[0]
    expect(firstWeek?.textContent).toBe("2627282930311")
  })
})
