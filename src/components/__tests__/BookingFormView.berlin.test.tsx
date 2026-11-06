import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { enUS } from "date-fns/locale"
import type { Control } from "react-hook-form"
import { useController } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DateRange } from "react-day-picker"

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  selectedInstant: "2030-07-14T22:00:00.000Z",
  calendarProps: undefined as
    undefined | { disabled: (date: Date) => boolean; selected?: DateRange },
}))
vi.mock("@/utils/trpc", () => ({
  trpc: { bookings: { create: { useMutation: () => ({ mutate: state.mutate }) } } },
}))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }))
vi.mock("@/contexts/AuthModalContext", () => ({ useAuthModal: () => ({ openAuthModal: vi.fn() }) }))
vi.mock("@/contexts/ViewContext", () => ({
  View: { LIST: "LIST" },
  useView: () => ({ setView: vi.fn() }),
}))
vi.mock("@/components/InteractiveTimeRangePicker", () => ({ default: () => null }))
vi.mock("@/components/TimeSelect", () => ({
  default: function Field({
    control,
    name,
    disabled,
  }: {
    control: Control<{ startTime: string; endTime: string }>
    name: "startTime" | "endTime"
    disabled: boolean
  }) {
    const { field } = useController({ control, name })
    return <input aria-label={name} disabled={disabled} {...field} />
  },
}))
vi.mock("@/components/BookingRulesDialog", () => ({
  BookingRulesDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button onClick={onConfirm}>Confirm rules</button> : null,
}))
vi.mock("@/components/ui/calendar", () => ({
  Calendar: (props: {
    onSelect: (range: DateRange, date: Date) => void
    disabled: (date: Date) => boolean
    selected?: DateRange
  }) => {
    state.calendarProps = props
    return (
      <button
        type="button"
        onClick={() => {
          // The picker normally gives TZDate; ordinary Date here also exercises RHF cloning.
          const date = new Date(state.selectedInstant)
          props.onSelect({ from: date, to: date }, date)
        }}
      >
        Choose Berlin day
      </button>
    )
  },
}))

import BookingFormView, { setNavigatingBetweenViews } from "../BookingFormView"

let sequence = 0
function form(id = `berlin-form-${++sequence}`) {
  return (
    <BookingFormView
      item={{ id, name: "Projector", type: "SPORTS", images: [], totalQuantity: 1 }}
      session={{ user: { id: "user", role: "USER", email: "user@example.test" }, expires: "2099-01-01" }}
      authStatus="authenticated"
      currentLocale={enUS}
      onGoBack={vi.fn()}
      onBookingSuccess={vi.fn()}
      onLoginRequest={vi.fn()}
    />
  )
}

describe("booking form Berlin calendar contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    window.scrollTo = vi.fn()
    setNavigatingBetweenViews(false)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it.each([
    ["2030-07-14T22:00:00.000Z", "2030-07-15T12:00:00.000Z", "July 15th, 2030"],
    ["2030-01-14T23:00:00.000Z", "2030-01-15T13:00:00.000Z", "January 15th, 2030"],
  ])("submits selected 14:00 as Berlin time for %s", async (day, expectedStart, dateLabel) => {
    state.selectedInstant = day
    render(form())
    fireEvent.click(screen.getByRole("button", { name: "Choose Berlin day" }))
    fireEvent.change(screen.getByLabelText("startTime"), { target: { value: "14:00" } })
    fireEvent.change(screen.getByLabelText("endTime"), { target: { value: "15:00" } })
    expect(screen.getByText(`${dateLabel} bookingForm.at 2:00 PM`)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "bookingForm.continueToBookingButton" }))
    fireEvent.click(await screen.findByRole("button", { name: "Confirm rules" }))
    await waitFor(() =>
      expect(state.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          start: expectedStart,
          end: new Date(new Date(expectedStart).getTime() + 3600000).toISOString(),
        }),
      ),
    )
  })

  it("rehydrates a stored Berlin day without moving it to the device's previous date", async () => {
    const id = `berlin-draft-${++sequence}`
    sessionStorage.setItem(
      `grh-form-${id}`,
      JSON.stringify({
        dateRange: { from: "2030-07-14T22:00:00.000Z" },
        startTime: "14:00",
        endTime: "15:00",
        quantity: 1,
        notes: "",
      }),
    )
    setNavigatingBetweenViews(true)
    render(form(id))
    expect(screen.getByText("July 15th, 2030 bookingForm.at 2:00 PM")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "bookingForm.continueToBookingButton" }))
    fireEvent.click(await screen.findByRole("button", { name: "Confirm rules" }))
    await waitFor(() =>
      expect(state.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ start: "2030-07-15T12:00:00.000Z" }),
      ),
    )
  })

  it("uses Berlin's current date for disabling past calendar days", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2030-07-14T23:30:00Z")) // July 15 in Berlin, July 14 in New York.
    render(form())
    expect(state.calendarProps?.disabled(new Date("2030-07-14T22:00:00Z"))).toBe(false)
    expect(state.calendarProps?.disabled(new Date("2030-07-13T22:00:00Z"))).toBe(true)
  })

  it("rejects a nonexistent Berlin spring-forward time without crashing the summary", async () => {
    state.selectedInstant = "2030-03-30T23:00:00.000Z"
    render(form())
    fireEvent.click(screen.getByRole("button", { name: "Choose Berlin day" }))
    fireEvent.change(screen.getByLabelText("startTime"), { target: { value: "02:30" } })
    fireEvent.change(screen.getByLabelText("endTime"), { target: { value: "04:00" } })
    fireEvent.click(screen.getByRole("button", { name: "bookingForm.continueToBookingButton" }))
    await screen.findByText("This Berlin date or time does not exist. Choose another time.")
    expect(state.mutate).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Confirm rules" })).toBeNull()
  })
})
