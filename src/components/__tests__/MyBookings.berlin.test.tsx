import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  update: vi.fn(),
  start: "2030-07-15T12:00:00.000Z",
  end: "2030-07-15T13:00:00.000Z",
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "resident", email: "resident@example.test", role: "USER" } },
    status: "authenticated",
  }),
}))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }))
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => true }))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    bookings: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: "booking",
              itemId: "item",
              userId: "user",
              status: "REQUESTED",
              quantity: 1,
              notes: null,
              startDate: state.start,
              endDate: state.end,
              createdAt: "2030-01-01T23:30:00.000Z",
              updatedAt: state.start,
              item: { id: "item", titleEn: "Projector", type: "SPORTS", totalQuantity: 1 },
            },
          ],
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      update: { useMutation: () => ({ mutate: state.update }) },
      cancel: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}))
vi.mock("@/components/TimeSelect", () => ({
  default: ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
  }) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

import MyBookings from "../MyBookings"

describe("my bookings Berlin display and edits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })
  afterEach(cleanup)

  it.each([
    ["2030-07-15T12:00:00.000Z", "2030-07-15T13:00:00.000Z", "2030-07-15T12:30:00.000Z"],
    ["2030-01-15T13:00:00.000Z", "2030-01-15T14:00:00.000Z", "2030-01-15T13:30:00.000Z"],
  ])("shows and edits Berlin 14:00 for %s", async (start, end, updatedStart) => {
    state.start = start
    state.end = end
    render(<MyBookings onGoBackToList={vi.fn()} />)
    expect(screen.getByText("2:00 PM – 3:00 PM")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "myBookings.editButton" }))
    expect((screen.getByLabelText("bookingForm.startTimeLabel") as HTMLInputElement).value).toBe(
      "14:00",
    )
    expect((screen.getByLabelText("bookingForm.endTimeLabel") as HTMLInputElement).value).toBe(
      "15:00",
    )
    fireEvent.change(screen.getByLabelText("bookingForm.startTimeLabel"), {
      target: { value: "14:30" },
    })
    fireEvent.click(screen.getByRole("button", { name: "common.saveChanges" }))
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({
        id: "booking",
        start: updatedStart,
        end,
        notes: undefined,
      }),
    )
  })

  it("shows Berlin's date and next-day marker when both instants share the device's date", () => {
    state.start = "2030-07-15T21:30:00.000Z" // Berlin July 15 23:30.
    state.end = "2030-07-15T22:30:00.000Z" // Berlin July 16 00:30.
    render(<MyBookings onGoBackToList={vi.fn()} />)
    expect(screen.getByText("Mon, Jul 15, 2030")).toBeTruthy()
    expect(screen.getByText("11:30 PM – 12:30 AM (myBookings.nextDayIndicator)")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "myBookings.viewDetailsButton" }))
    expect(screen.getByText("July 15th, 2030 - July 16th, 2030")).toBeTruthy()
  })

  it("opens a past highlighted booking without trapping the user in the past filter", async () => {
    state.start = "2020-07-15T12:00:00Z"
    state.end = "2020-07-15T13:00:00Z"
    render(<MyBookings onGoBackToList={vi.fn()} highlightBookingId="booking" />)
    expect(
      screen.getByRole("tab", { name: "myBookings.tabs.past" }).getAttribute("aria-selected"),
    ).toBe("true")
    expect(screen.getByText("Projector")).toBeTruthy()
    await userEvent.click(screen.getByRole("tab", { name: "myBookings.tabs.upcoming" }))
    expect(
      screen.getByRole("tab", { name: "myBookings.tabs.upcoming" }).getAttribute("aria-selected"),
    ).toBe("true")
    expect(screen.queryByText("Projector")).toBeNull()
  })
})
