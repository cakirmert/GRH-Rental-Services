import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { de, enUS } from "date-fns/locale"
import type { BookingFormViewProps } from "../BookingFormView"
import type { Control } from "react-hook-form"
import { useController } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DateRange } from "react-day-picker"

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutationHandlers: {} as { onSuccess?: (booking: { id: string }) => void },
  rulesConfirm: undefined as undefined | (() => void | Promise<void>),
  locale: "en",
  selectedInstant: "2030-07-14T22:00:00.000Z",
  calendarProps: undefined as
    undefined | { disabled: (date: Date) => boolean; selected?: DateRange },
}))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    bookings: {
      create: {
        useMutation: (handlers: typeof state.mutationHandlers) => {
          state.mutationHandlers = handlers
          return { mutate: state.mutate }
        },
      },
    },
  },
}))
vi.mock("@/locales/i18n", () => ({
  useI18n: () => ({ locale: state.locale, t: (key: string) => key }),
}))
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
  BookingRulesDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean
    onConfirm: () => void | Promise<void>
  }) => {
    if (open) state.rulesConfirm = onConfirm
    return open ? <button onClick={onConfirm}>Confirm rules</button> : null
  },
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
function form(id = `berlin-form-${++sequence}`, overrides: Partial<BookingFormViewProps> = {}) {
  return (
    <BookingFormView
      item={{ id, name: "Projector", type: "SPORTS", images: [], totalQuantity: 1 }}
      session={{
        user: { id: "user", role: "USER", email: "user@example.test" },
        expires: "2099-01-01",
      }}
      authStatus="authenticated"
      currentLocale={enUS}
      onGoBack={vi.fn()}
      onBookingSuccess={vi.fn()}
      onLoginRequest={vi.fn()}
      {...overrides}
    />
  )
}

describe("booking form Berlin calendar contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.locale = "en"
    state.selectedInstant = "2030-07-14T22:00:00.000Z"
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

  it("ignores legacy browser drafts and submits newly selected Berlin times", async () => {
    const id = `berlin-draft-${++sequence}`
    sessionStorage.setItem(
      `grh-form-${id}`,
      JSON.stringify({
        dateRange: { from: "2030-07-14T22:00:00.000Z" },
        startTime: "14:00",
        endTime: "15:00",
        quantity: 1,
        notes: "Another account's private purpose",
      }),
    )
    setNavigatingBetweenViews(true)
    render(form(id))
    expect((screen.getByLabelText("startTime") as HTMLInputElement).value).toBe("")
    expect(screen.queryByDisplayValue("Another account's private purpose")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Choose Berlin day" }))
    fireEvent.change(screen.getByLabelText("startTime"), { target: { value: "14:00" } })
    fireEvent.change(screen.getByLabelText("endTime"), { target: { value: "15:00" } })
    fireEvent.click(screen.getByRole("button", { name: "bookingForm.continueToBookingButton" }))
    fireEvent.click(await screen.findByRole("button", { name: "Confirm rules" }))
    await waitFor(() =>
      expect(state.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ start: "2030-07-15T12:00:00.000Z" }),
      ),
    )
  })

  it("keeps a local draft through locale changes but clears it for another account or item", () => {
    const id = `local-draft-${++sequence}`
    const view = render(form(id))
    fireEvent.click(screen.getByRole("button", { name: "Choose Berlin day" }))
    fireEvent.change(screen.getByLabelText("startTime"), { target: { value: "14:00" } })
    fireEvent.change(screen.getByLabelText("endTime"), { target: { value: "15:00" } })
    fireEvent.change(screen.getByRole("textbox", { name: "bookingForm.notesLabel" }), {
      target: { value: "Private first-account purpose" },
    })
    state.locale = "de"
    view.rerender(form(id, { currentLocale: de }))
    expect((screen.getByLabelText("startTime") as HTMLInputElement).value).toBe("14:00")
    expect(screen.getByDisplayValue("Private first-account purpose")).toBeTruthy()
    expect(sessionStorage.length).toBe(0)
    view.rerender(
      form(id, {
        session: {
          user: { id: "other-user", role: "USER", email: "other@example.test" },
          expires: "2099-01-01",
        },
      }),
    )
    expect(screen.queryByDisplayValue("Private first-account purpose")).toBeNull()
    expect((screen.getByLabelText("startTime") as HTMLInputElement).value).toBe("")
    fireEvent.change(screen.getByRole("textbox", { name: "bookingForm.notesLabel" }), {
      target: { value: "Second draft" },
    })
    view.rerender(
      form(`${id}-other-item`, {
        session: {
          user: { id: "other-user", role: "USER", email: "other@example.test" },
          expires: "2099-01-01",
        },
      }),
    )
    expect(screen.queryByDisplayValue("Second draft")).toBeNull()
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it("requires a purpose for lowercase room items before the rules confirmation", async () => {
    render(
      form("room-purpose", {
        item: { id: "room-purpose", name: "Bar", type: "room", totalQuantity: 1 },
      }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Choose Berlin day" }))
    fireEvent.change(screen.getByLabelText("startTime"), { target: { value: "14:00" } })
    fireEvent.change(screen.getByLabelText("endTime"), { target: { value: "15:00" } })
    fireEvent.click(screen.getByRole("button", { name: "bookingForm.continueToBookingButton" }))
    await screen.findAllByText("Please describe the purpose of your booking.")
    expect(screen.queryByRole("button", { name: "Confirm rules" })).toBeNull()
    fireEvent.change(screen.getByRole("textbox", { name: "bookingForm.notesLabelRequired" }), {
      target: { value: "Community meeting" },
    })
    fireEvent.click(screen.getByRole("button", { name: "bookingForm.continueToBookingButton" }))
    await screen.findByRole("button", { name: "Confirm rules" })
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it("delegates back navigation to its caller", () => {
    const goBack = vi.fn()
    render(form(undefined, { onGoBack: goBack }))
    fireEvent.click(screen.getByRole("button", { name: "common.back" }))
    expect(goBack).toHaveBeenCalledOnce()
  })

  it("does not navigate the new account when an old account's pending booking succeeds", async () => {
    const success = vi.fn()
    const view = render(form("pending-booking", { onBookingSuccess: success }))
    fireEvent.click(screen.getByRole("button", { name: "Choose Berlin day" }))
    fireEvent.change(screen.getByLabelText("startTime"), { target: { value: "14:00" } })
    fireEvent.change(screen.getByLabelText("endTime"), { target: { value: "15:00" } })
    fireEvent.click(screen.getByRole("button", { name: "bookingForm.continueToBookingButton" }))
    fireEvent.click(await screen.findByRole("button", { name: "Confirm rules" }))
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce())
    const previousHandlers = state.mutationHandlers
    view.rerender(
      form("pending-booking", {
        session: {
          user: { id: "other-user", email: "other@example.test", role: "USER" },
          expires: "2099-01-01",
        },
        onBookingSuccess: success,
      }),
    )
    previousHandlers.onSuccess?.({ id: "first-account-booking" })
    expect(success).not.toHaveBeenCalled()
    expect((screen.getByLabelText("startTime") as HTMLInputElement).value).toBe("")
  })

  it("cancels a rules submission whose async validation finishes after an account switch", async () => {
    const view = render(form("validation-pending"))
    fireEvent.click(screen.getByRole("button", { name: "Choose Berlin day" }))
    fireEvent.change(screen.getByLabelText("startTime"), { target: { value: "14:00" } })
    fireEvent.change(screen.getByLabelText("endTime"), { target: { value: "15:00" } })
    fireEvent.click(screen.getByRole("button", { name: "bookingForm.continueToBookingButton" }))
    await screen.findByRole("button", { name: "Confirm rules" })
    let pending: void | Promise<void>
    act(() => {
      pending = state.rulesConfirm!()
    })
    view.rerender(
      form("validation-pending", {
        session: {
          user: { id: "other-user", email: "other@example.test", role: "USER" },
          expires: "2099-01-01",
        },
      }),
    )
    await act(async () => {
      await pending
    })
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it.each(["USER", "RENTAL", "ADMIN"])("preserves the calendar range limit for %s", (role) => {
    render(
      form(undefined, {
        session: {
          user: { id: "actor", email: "actor@example.test", role },
          expires: "2099-01-01",
        },
      }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Choose Berlin day" }))
    expect(state.calendarProps?.disabled(new Date("2030-07-16T22:00:00Z"))).toBe(role === "USER")
    expect(state.calendarProps?.disabled(new Date("2030-07-28T22:00:00Z"))).toBe(true)
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
