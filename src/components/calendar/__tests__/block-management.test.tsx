import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BlockSlotDialog } from "../block-slot-dialog"
import { BookingDialog } from "../booking-dialog"
import { CalendarProvider, useCalendar } from "../calendar-provider"
import { I18nProvider } from "@/locales/i18n"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"
import type { CalendarBooking } from "../types"

const mocks = vi.hoisted(() => ({
  items: vi.fn(),
  create: vi.fn(),
  cancelOccurrence: vi.fn(),
  stopSeries: vi.fn(),
  cancelBooking: vi.fn(),
  updateBooking: vi.fn(),
  retry: vi.fn(),
  mutationError: null as { message: string } | null,
}))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    bookings: {
      blockableItems: { useQuery: mocks.items },
      blockSlots: { useMutation: () => ({ mutate: mocks.create, isPending: false }) },
      cancelBlockOccurrence: {
        useMutation: () => ({
          mutate: mocks.cancelOccurrence,
          isPending: false,
          error: mocks.mutationError,
        }),
      },
      stopBlockSeries: { useMutation: () => ({ mutate: mocks.stopSeries, isPending: false }) },
      cancel: { useMutation: () => ({ mutate: mocks.cancelBooking, isPending: false }) },
      updateBookingStatusByTeam: {
        useMutation: () => ({ mutate: mocks.updateBooking, isPending: false }),
      },
    },
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

const item = { id: "assigned-bar", titleEn: "Bar", titleDe: "Barraum", totalQuantity: 1 }
const block: CalendarBooking = {
  id: "virtual:series:2026-11-06",
  recurringBlockId: "series-1",
  frequency: "WEEKLY",
  until: null,
  occurrenceStart: new Date("2026-11-06T13:00:00Z"),
  startDate: new Date("2026-11-06T13:00:00Z"),
  endDate: new Date("2026-11-07T13:00:00Z"),
  status: "ACCEPTED",
  notes: `${ADMIN_BLOCK_PREFIX} Bar evening`,
  item: { ...item, type: "ROOM" },
  user: null,
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <CalendarProvider responsive={false}>{children}</CalendarProvider>
    </I18nProvider>
  )
}

function OpenBooking({ booking }: { booking: CalendarBooking }) {
  const { setSelectedBooking } = useCalendar()
  return (
    <>
      <button onClick={() => setSelectedBooking(booking)}>Open booking</button>
      <BookingDialog />
    </>
  )
}

async function choose(name: string, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name }), { key: "Enter" })
  await userEvent.click(screen.getByRole("option", { name: option }))
}

function setTimes(start = "2026-11-06T14:00", end = "2026-11-07T14:00") {
  fireEvent.change(screen.getByLabelText("Start"), { target: { value: start } })
  fireEvent.change(screen.getByLabelText("End"), { target: { value: end } })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.mutationError = null
  mocks.items.mockReturnValue({
    data: [item],
    isLoading: false,
    isError: false,
    refetch: mocks.retry,
  })
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
  vi.unstubAllGlobals()
})

describe("blocking assigned items", () => {
  it("submits an indefinite weekly overnight block using Berlin time", async () => {
    render(
      <Wrapper>
        <BlockSlotDialog open onOpenChange={vi.fn()} />
      </Wrapper>,
    )
    await choose("Item or room", "Bar")
    setTimes()
    await choose("Recurrence", "Repeat weekly")
    expect(screen.getByRole("checkbox", { name: "No end date" }).getAttribute("aria-checked")).toBe(
      "true",
    )
    expect(screen.queryByLabelText("Repeat until")).toBeNull()
    expect(screen.getByText(/All times below use Berlin time/)).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }))
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        itemId: "assigned-bar",
        start: "2026-11-06T13:00:00.000Z",
        end: "2026-11-07T13:00:00.000Z",
        recurrence: { frequency: "WEEKLY" },
      }),
    )
  })

  it("requires an end date only when requested and includes the whole last Berlin day", async () => {
    render(
      <Wrapper>
        <BlockSlotDialog open onOpenChange={vi.fn()} />
      </Wrapper>,
    )
    await choose("Item or room", "Bar")
    setTimes()
    await choose("Recurrence", "Repeat weekly")
    await userEvent.click(screen.getByRole("checkbox", { name: "No end date" }))
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }))
    expect(screen.getByRole("alert").textContent).toContain("Select an end date")
    expect(mocks.create).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Repeat until"), { target: { value: "2027-04-02" } })
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }))
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: { frequency: "WEEKLY", until: "2027-04-02T21:59:00.000Z" },
      }),
    )
  })

  it("rejects nonexistent Berlin times at the summer-time transition", async () => {
    render(
      <Wrapper>
        <BlockSlotDialog open onOpenChange={vi.fn()} />
      </Wrapper>,
    )
    await choose("Item or room", "Bar")
    setTimes("2027-03-28T02:30", "2027-03-28T04:30")
    await userEvent.click(screen.getByRole("button", { name: "Block slot" }))
    expect(screen.getByRole("alert").textContent).toContain("valid Berlin start and end times")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("disables creation when the user has no assigned items", () => {
    mocks.items.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(
      <Wrapper>
        <BlockSlotDialog open onOpenChange={vi.fn()} />
      </Wrapper>,
    )
    expect(screen.getByText(/No items are assigned to you/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Block slot" }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it("shows a retry when item authorization cannot be loaded instead of treating it as no assignments", async () => {
    mocks.items.mockReturnValue({ data: [], isLoading: false, isError: true, refetch: mocks.retry })
    render(
      <Wrapper>
        <BlockSlotDialog open onOpenChange={vi.fn()} />
      </Wrapper>,
    )
    expect(screen.queryByText(/No items are assigned to you/)).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded")
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mocks.retry).toHaveBeenCalledOnce()
    expect((screen.getByRole("button", { name: "Block slot" }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe("managing calendar blocks", () => {
  it.each([
    ["Remove this occurrence", "Remove block", "cancelOccurrence"],
    ["Stop from this date", "Stop future repeats", "stopSeries"],
  ] as const)(
    "confirms %s and uses only the dedicated block action",
    async (action, confirm, mutation) => {
      // Metadata identifies a durable block even if legacy note formatting is absent.
      render(
        <Wrapper>
          <OpenBooking booking={{ ...block, notes: null }} />
        </Wrapper>,
      )
      await userEvent.click(screen.getByRole("button", { name: "Open booking" }))
      expect(screen.getByText(/2026-11-06 14:00.*Berlin time/)).toBeTruthy()
      expect(screen.getByText("No end date")).toBeTruthy()
      expect(screen.queryByRole("button", { name: "Mark Borrowed" })).toBeNull()
      await userEvent.click(screen.getByRole("button", { name: action }))
      expect(mocks[mutation]).not.toHaveBeenCalled()
      expect(screen.getByRole("alert").textContent).toContain(
        mutation === "stopSeries"
          ? "Earlier occurrences stay unchanged"
          : "Other repeats stay unchanged",
      )
      await userEvent.click(screen.getByRole("button", { name: confirm }))
      expect(mocks[mutation]).toHaveBeenCalledExactlyOnceWith({
        recurringBlockId: "series-1",
        occurrenceStart: "2026-11-06T13:00:00.000Z",
      })
      expect(mocks.cancelBooking).not.toHaveBeenCalled()
      expect(mocks.updateBooking).not.toHaveBeenCalled()
    },
  )

  it("does not offer series controls for a non-repeating block", async () => {
    render(
      <Wrapper>
        <OpenBooking booking={{ ...block, frequency: "NONE" }} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Open booking" }))
    expect(screen.getByRole("button", { name: "Remove block" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Stop from this date" })).toBeNull()
  })

  it("keeps legacy stored blocks on their existing cancellation path", async () => {
    const { recurringBlockId: _id, occurrenceStart: _start, ...legacy } = block
    render(
      <Wrapper>
        <OpenBooking booking={legacy} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Open booking" }))
    await userEvent.click(screen.getByRole("button", { name: "Remove block" }))
    expect(mocks.cancelBooking).toHaveBeenCalledExactlyOnceWith({ id: block.id })
    expect(mocks.cancelOccurrence).not.toHaveBeenCalled()
  })

  it("shows fresh permission failures without hiding the selected block", async () => {
    mocks.mutationError = { message: "You are no longer responsible for this item." }
    render(
      <Wrapper>
        <OpenBooking booking={block} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Open booking" }))
    expect(screen.getByRole("alert").textContent).toContain("no longer responsible")
    expect(screen.getByRole("dialog")).toBeTruthy()
  })
})
