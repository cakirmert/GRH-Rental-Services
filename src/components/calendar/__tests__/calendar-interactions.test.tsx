import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CalendarProvider, useCalendar } from "../calendar-provider"
import { CalendarHeader } from "../calendar-header"
import { AgendaView } from "../calendar-views/agenda-view"
import { BookingEvent } from "../booking-event"
import { I18nProvider } from "@/locales/i18n"
import type { CalendarBooking } from "../types"
import { useState, type ReactNode } from "react"
import { BlockSlotDialog } from "../block-slot-dialog"
import { Calendar } from "../calendar"
import { ReleaseProvider, useRelease } from "@/contexts/ReleaseContext"

const { query, retry } = vi.hoisted(() => ({ query: vi.fn(), retry: vi.fn() }))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    bookings: {
      getBookings: { useQuery: query },
      blockSlots: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateBookingStatusByTeam: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      cancel: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    items: { all: { useQuery: () => ({ data: [], isLoading: false }) } },
    useUtils: () => ({
      bookings: {
        getBookings: { invalidate: vi.fn() },
        listForRentalTeam: { invalidate: vi.fn() },
      },
    }),
  },
}))
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const sample: CalendarBooking = {
  id: "booking-1",
  startDate: new Date(2026, 11, 31, 10),
  endDate: new Date(2027, 0, 1, 11),
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
      <button onClick={() => setSelectedDate(new Date(2027, 0, 3, 14))}>
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
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 11, 31, 12))
  localStorage.clear()
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  query.mockReturnValue({ data: [], isPending: false, isError: false, refetch: retry })
  retry.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("calendar navigation", () => {
  it("keeps classic as the default and switches back from the preview agenda without leaking view state", async () => {
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
    expect(screen.queryByRole("button", { name: "Agenda" })).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Switch interface" }))
    expect(screen.getByRole("button", { name: "Agenda" }).getAttribute("aria-pressed")).toBe("true")
    await userEvent.click(screen.getByRole("button", { name: "Switch interface" }))
    expect(screen.queryByRole("button", { name: "Agenda" })).toBeNull()
    expect(screen.getByRole("button", { name: "Week" })).toBeTruthy()
  })
  it("moves by the active view, jumps to a local calendar date, and returns to today", async () => {
    const user = userEvent.setup()
    render(
      <TestCalendar>
        <CalendarHeader />
      </TestCalendar>,
    )
    expect(screen.getByRole("heading").textContent).toBe("27 Dec 2026 – 2 Jan 2027")
    await user.click(screen.getByRole("button", { name: "Next week" }))
    expect(screen.getByRole("heading").textContent).toBe("3 Jan 2027 – 9 Jan 2027")
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
  it("retains a selected time while the block dialog is closed and uses it when opened", async () => {
    render(
      <TestCalendar>
        <SlotSelection />
      </TestCalendar>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Select afternoon slot" }))
    expect(screen.getByLabelText("Selected slot").textContent).toBe(
      new Date(2027, 0, 3, 14).toISOString(),
    )
    await userEvent.click(screen.getByRole("button", { name: "Open block dialog" }))
    expect((screen.getByLabelText("Start") as HTMLInputElement).value).toBe("2027-01-03T14:00")
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
