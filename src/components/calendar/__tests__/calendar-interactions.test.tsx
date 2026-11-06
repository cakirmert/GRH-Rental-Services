import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CalendarProvider, useCalendar } from "../calendar-provider"
import { CalendarHeader } from "../calendar-header"
import { AgendaView } from "../calendar-views/agenda-view"
import { WeekView } from "../calendar-views/week-view"
import { MonthView } from "../calendar-views/month-view"
import { DayView } from "../calendar-views/day-view"
import { WeekView as ClassicWeekView } from "../classic/calendar-views/week-view"
import { MonthView as ClassicMonthView } from "../classic/calendar-views/month-view"
import { DayView as ClassicDayView } from "../classic/calendar-views/day-view"
import { BookingEvent } from "../booking-event"
import { BookingEvent as ClassicBookingEvent } from "../classic/booking-event"
import { I18nProvider } from "@/locales/i18n"
import type { CalendarBooking } from "../types"
import { useState, type ReactNode } from "react"
import { BlockSlotDialog } from "../block-slot-dialog"
import { Calendar } from "../calendar"
import { ReleaseProvider, useRelease } from "@/contexts/ReleaseContext"
import { berlinDateFromParts as berlinDate, formatBerlinDateTime } from "@/lib/berlin-time"

const { query, retry } = vi.hoisted(() => ({ query: vi.fn(), retry: vi.fn() }))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    bookings: {
      getBookings: { useQuery: query },
      blockableItems: { useQuery: () => ({ data: [], isLoading: false }) },
      blockSlots: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateBookingStatusByTeam: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      cancel: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      cancelBlockOccurrence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      stopBlockSeries: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    items: { all: { useQuery: () => ({ data: [], isLoading: false }) } },
    useUtils: () => ({
      bookings: {
        getBookings: { invalidate: vi.fn() },
        listForRentalTeam: { invalidate: vi.fn() },
        availability: { invalidate: vi.fn() },
      },
    }),
  },
}))
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const sample: CalendarBooking = {
  id: "booking-1",
  startDate: berlinDate(2026, 11, 31, 10),
  endDate: berlinDate(2027, 0, 1, 11),
  status: "ACCEPTED",
  notes: null,
  item: { id: "room", titleEn: "Common room", titleDe: "Gemeinschaftsraum", type: "ROOM" },
  user: { id: "resident", name: "Alex", email: "alex@example.com" },
}

function Selection() {
  const { selectedBooking } = useCalendar()
  return <output aria-label="Selected booking">{selectedBooking?.id ?? "none"}</output>
}

function TestCalendar({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <CalendarProvider>{children}</CalendarProvider>
    </I18nProvider>
  )
}

function SlotSelection() {
  const { selectedDate, setSelectedDate } = useCalendar()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setSelectedDate(berlinDate(2027, 0, 3, 14))}>
        Select afternoon slot
      </button>
      <button onClick={() => setOpen(true)}>Open block dialog</button>
      <output aria-label="Selected slot">{selectedDate?.toISOString() ?? "none"}</output>
      <BlockSlotDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function ReleaseToggle() {
  const { mode, setMode } = useRelease()
  return (
    <button onClick={() => setMode(mode === "classic" ? "preview" : "classic")}>
      Switch interface
    </button>
  )
}

beforeEach(() => {
  vi.stubEnv("TZ", "America/New_York")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(berlinDate(2026, 11, 31, 12))
  localStorage.clear()
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  query.mockReturnValue({ data: [], isPending: false, isError: false, refetch: retry })
  query.mockClear()
  retry.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("calendar navigation", () => {
  it("uses Berlin today, week bounds, date navigation and DST-day bounds while the browser is in New York", async () => {
    vi.setSystemTime(new Date("2026-11-08T23:30:00Z")) // Monday in Berlin, Sunday in New York.
    render(
      <TestCalendar>
        <CalendarHeader />
        <WeekView />
      </TestCalendar>,
    )
    expect((screen.getByLabelText("Jump to date") as HTMLInputElement).value).toBe("2026-11-09")
    expect(screen.getByRole("heading").textContent).toBe("9 Nov 2026 – 15 Nov 2026")
    expect(query.mock.calls[0]?.[0].start.getTime()).toBe(Date.parse("2026-11-08T23:00:00.000Z"))
    expect(query.mock.calls[0]?.[0].end.getTime()).toBe(Date.parse("2026-11-15T22:59:59.999Z"))
    expect(
      screen
        .getByRole("button", { name: "Monday, November 9th, 2026" })
        .getAttribute("aria-current"),
    ).toBe("date")
    await userEvent.click(screen.getByRole("button", { name: "Day" }))
    fireEvent.change(screen.getByLabelText("Jump to date"), { target: { value: "2027-03-28" } })
    expect(screen.getByRole("heading").textContent).toBe("Sunday, 28 Mar 2027")
    await userEvent.click(screen.getByRole("button", { name: "Next day" }))
    expect((screen.getByLabelText("Jump to date") as HTMLInputElement).value).toBe("2027-03-29")
    await userEvent.click(screen.getByRole("button", { name: "Today" }))
    expect((screen.getByLabelText("Jump to date") as HTMLInputElement).value).toBe("2026-11-09")
  })

  it.each([
    ["new", DayView],
    ["classic", ClassicDayView],
  ] as const)("queries the exact Berlin spring-forward day in the %s calendar", (_name, View) => {
    vi.setSystemTime(new Date("2027-03-28T12:00:00Z"))
    render(
      <TestCalendar>
        <View />
      </TestCalendar>,
    )
    expect(query.mock.calls[0]?.[0].start.getTime()).toBe(Date.parse("2027-03-27T23:00:00.000Z"))
    expect(query.mock.calls[0]?.[0].end.getTime()).toBe(Date.parse("2027-03-28T22:00:00.000Z"))
  })

  describe.each(["en", "de"])("Monday-first weeks in %s", (language) => {
    it.each([
      ["new week", WeekView, false, false],
      ["classic week", ClassicWeekView, false, true],
      ["new month", MonthView, true, false],
      ["classic month", ClassicMonthView, true, true],
    ] as const)("aligns the %s grid and fetched range", (_name, View, month, classic) => {
      vi.setSystemTime(berlinDate(2026, 10, 1, 12)) // Sunday and first day of a month.
      localStorage.setItem("grh-booking-language", language)
      const { container } = render(
        <TestCalendar>
          <View />
        </TestCalendar>,
      )
      const range = query.mock.calls[0]?.[0]
      expect(range.start).toEqual(berlinDate(2026, 9, 26))
      expect(range.end).toEqual(
        month ? berlinDate(2026, 11, 6, 23, 59, 59, 999) : berlinDate(2026, 10, 1, 23, 59, 59, 999),
      )
      const headings = container.querySelector(".grid")!.children
      const firstDay = headings[month ? 0 : 1]?.textContent
      const lastDay = headings[month ? 6 : 7]?.textContent
      expect(firstDay).toMatch(language === "de" && !classic ? /^Mo\./ : /^Mon/)
      expect(lastDay).toMatch(language === "de" && !classic ? /^So\./ : /^Sun/)
    })

    it("keeps Sunday last in the agenda", () => {
      vi.setSystemTime(berlinDate(2026, 10, 1, 12))
      localStorage.setItem("grh-booking-language", language)
      query.mockReturnValue({
        data: [
          {
            ...sample,
            startDate: berlinDate(2026, 10, 1, 10),
            endDate: berlinDate(2026, 10, 1, 11),
          },
        ],
        isPending: false,
        isError: false,
        refetch: retry,
      })
      const { container } = render(
        <TestCalendar>
          <AgendaView />
        </TestCalendar>,
      )
      const days = container.querySelectorAll("section")
      expect(days).toHaveLength(7)
      expect(days[0]?.getAttribute("aria-label")).toMatch(language === "de" ? /^Montag/ : /^Monday/)
      expect(days[6]?.getAttribute("aria-label")).toMatch(
        language === "de" ? /^Sonntag/ : /^Sunday/,
      )
      expect(query.mock.calls[0]?.[0].start).toEqual(berlinDate(2026, 9, 26))
      expect(query.mock.calls[0]?.[0].end).toEqual(berlinDate(2026, 10, 1, 23, 59, 59, 999))
    })
  })

  it("starts with the new agenda and switches through classic without leaking view state", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    render(
      <I18nProvider>
        <ReleaseProvider>
          <ReleaseToggle />
          <Calendar />
        </ReleaseProvider>
      </I18nProvider>,
    )
    expect(screen.getByRole("button", { name: "Agenda" }).getAttribute("aria-pressed")).toBe("true")
    await userEvent.click(screen.getByRole("button", { name: "Switch interface" }))
    expect(screen.queryByRole("button", { name: "Agenda" })).toBeNull()
    expect(screen.getByRole("button", { name: "Week" })).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Switch interface" }))
    expect(screen.getByRole("button", { name: "Agenda" }).getAttribute("aria-pressed")).toBe("true")
  })
  it("moves by the active view, jumps to a local calendar date, and returns to today", async () => {
    const user = userEvent.setup()
    render(
      <TestCalendar>
        <CalendarHeader />
      </TestCalendar>,
    )
    expect(screen.getByRole("heading").textContent).toBe("28 Dec 2026 – 3 Jan 2027")
    await user.click(screen.getByRole("button", { name: "Next week" }))
    expect(screen.getByRole("heading").textContent).toBe("4 Jan 2027 – 10 Jan 2027")
    await user.click(screen.getByRole("button", { name: "Day" }))
    fireEvent.change(screen.getByLabelText("Jump to date"), { target: { value: "2027-02-03" } })
    expect(screen.getByRole("heading").textContent).toBe("Wednesday, 3 Feb 2027")
    await user.click(screen.getByRole("button", { name: "Previous day" }))
    expect(screen.getByRole("heading").textContent).toBe("Tuesday, 2 Feb 2027")
    await user.click(screen.getByRole("button", { name: "Today" }))
    expect((screen.getByLabelText("Jump to date") as HTMLInputElement).value).toBe("2026-12-31")
  })

  it("defaults to agenda on phones while keeping every view selectable", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    render(
      <TestCalendar>
        <CalendarHeader />
      </TestCalendar>,
    )
    expect(screen.getByRole("button", { name: "Agenda" }).getAttribute("aria-pressed")).toBe("true")
    await userEvent.click(screen.getByRole("button", { name: "Month" }))
    expect(screen.getByRole("button", { name: "Month" }).getAttribute("aria-pressed")).toBe("true")
  })
})

describe("booking access and query feedback", () => {
  it("labels a Berlin midnight crossing in both interfaces regardless of browser date", () => {
    const overnight = {
      ...sample,
      startDate: new Date("2026-11-08T22:30:00Z"),
      endDate: new Date("2026-11-08T23:30:00Z"),
    }
    render(
      <TestCalendar>
        <BookingEvent booking={overnight} />
        <ClassicBookingEvent booking={overnight} />
      </TestCalendar>,
    )
    expect(screen.getByRole("button", { name: /8 Nov 23:30 – 9 Nov 00:30/ })).toBeTruthy()
    expect(screen.getByText("23:30 - 00:30 +1d")).toBeTruthy()
  })

  describe.each([
    ["spring", 2, 28],
    ["autumn", 9, 31],
  ] as const)("%s clock change", (_season, month, date) => {
    beforeEach(() => {
      vi.setSystemTime(berlinDate(2027, month, date, 12))
      query.mockReturnValue({
        data: [
          {
            ...sample,
            startDate: berlinDate(2027, month, date, 14),
            endDate: berlinDate(2027, month, date, 15),
          },
        ],
        isPending: false,
        isError: false,
        refetch: retry,
      })
    })

    it.each([
      ["new day", DayView],
      ["new week", WeekView],
      ["classic day", ClassicDayView],
      ["classic week", ClassicWeekView],
    ] as const)("draws a 14:00 booking at the 14:00 row in %s", (_name, View) => {
      const { container } = render(
        <TestCalendar>
          <View />
        </TestCalendar>,
      )
      const positioned = [...container.querySelectorAll<HTMLElement>("[style]")].find(
        (node) => node.style.top && node.textContent?.includes("Common room"),
      )
      expect(positioned?.style.top).toBe(`${14 * 64}px`)
      expect(positioned?.style.height).toBe("64px")
    })

    it("selects the labelled 14:00 slot and disables the missing spring hour", async () => {
      function SelectedSlot() {
        const { selectedDate } = useCalendar()
        return <output aria-label="Selected slot">{selectedDate?.toISOString() ?? "none"}</output>
      }
      render(
        <TestCalendar>
          <DayView />
          <SelectedSlot />
        </TestCalendar>,
      )
      await userEvent.click(screen.getByRole("button", { name: /Select time: .*14:00$/ }))
      expect(screen.getByLabelText("Selected slot").textContent).toBe(
        berlinDate(2027, month, date, 14).toISOString(),
      )
      if (month === 2) {
        const missingHour = screen.getByRole("button", {
          name: /Unavailable time.*02:00$/,
        }) as HTMLButtonElement
        expect(missingHour.disabled).toBe(true)
        expect(screen.queryByRole("button", { name: /Select time: .*02:00$/ })).toBeNull()
      }
    })
  })

  it.each([
    ["new week", WeekView, 2],
    ["classic week", ClassicWeekView, 2],
    ["new month", MonthView, 2],
    ["classic month", ClassicMonthView, 2],
    ["new day", DayView, 1],
    ["classic day", ClassicDayView, 1],
  ] as const)("shows the overnight portion of a block in %s", (_name, View, occurrences) => {
    vi.setSystemTime(berlinDate(2026, 10, 7, 12))
    query.mockReturnValue({
      data: [
        {
          ...sample,
          recurringBlockId: "overnight",
          notes: null,
          startDate: berlinDate(2026, 10, 6, 22),
          endDate: berlinDate(2026, 10, 7, 2),
        },
      ],
      isPending: false,
      isError: false,
      refetch: retry,
    })
    render(
      <TestCalendar>
        <View />
      </TestCalendar>,
    )
    expect(screen.getAllByText(/^Blocked: C/)).toHaveLength(occurrences)
  })

  it("retains a selected time while the block dialog is closed and uses it when opened", async () => {
    render(
      <TestCalendar>
        <SlotSelection />
      </TestCalendar>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Select afternoon slot" }))
    expect(screen.getByLabelText("Selected slot").textContent).toBe(
      berlinDate(2027, 0, 3, 14).toISOString(),
    )
    await userEvent.click(screen.getByRole("button", { name: "Open block dialog" }))
    expect((screen.getByLabelText("Start") as HTMLInputElement).value).toBe(
      formatBerlinDateTime(berlinDate(2027, 0, 3, 14)),
    )
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByLabelText("Selected slot").textContent).toBe("none")
  })
  it("opens the existing booking selection with the keyboard and localizes the item title", async () => {
    localStorage.setItem("grh-booking-language", "de")
    render(
      <TestCalendar>
        <BookingEvent booking={sample} agenda />
        <Selection />
      </TestCalendar>,
    )
    const button = screen.getByRole("button", { name: /Gemeinschaftsraum/ })
    button.focus()
    await userEvent.keyboard("{Enter}")
    expect(screen.getByLabelText("Selected booking").textContent).toBe("booking-1")
    expect(button.textContent).toContain("Akzeptiert")
    expect(button.textContent).toContain("1 Jan")
  })

  it("shows overnight bookings on both relevant days in the agenda", () => {
    query.mockReturnValue({ data: [sample], isPending: false, isError: false, refetch: retry })
    render(
      <TestCalendar>
        <AgendaView />
      </TestCalendar>,
    )
    expect(screen.getAllByRole("button", { name: /Common room/ })).toHaveLength(2)
  })

  it("distinguishes a failed request from an empty schedule and offers retry", async () => {
    query.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: retry })
    render(
      <TestCalendar>
        <AgendaView />
      </TestCalendar>,
    )
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded")
    expect(screen.queryByText("A clear week ahead")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
