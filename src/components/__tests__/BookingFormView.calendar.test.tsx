import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { enUS } from "date-fns/locale"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { availabilityUseQuery } = vi.hoisted(() => ({
  availabilityUseQuery: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: new Error("Availability request failed"),
  })),
}))

vi.mock("@/utils/trpc", () => ({
  trpc: {
    bookings: {
      availability: { useQuery: availabilityUseQuery },
      create: {
        useMutation: () => ({ mutate: vi.fn() }),
      },
    },
  },
}))

vi.mock("@/locales/i18n", () => ({
  useI18n: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}))

vi.mock("@/contexts/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}))

vi.mock("@/contexts/ViewContext", () => ({
  View: { LIST: "LIST" },
  useView: () => ({ setView: vi.fn() }),
}))

vi.mock("@/components/TimeSelect", () => ({
  default: ({ name, disabled }: { name: string; disabled?: boolean }) => (
    <input aria-label={name} disabled={disabled} />
  ),
}))

vi.mock("@/components/BookingRulesDialog", () => ({
  BookingRulesDialog: () => null,
}))

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({
    onSelect,
  }: {
    onSelect: (range: { from: Date; to: Date }, selectedDay: Date) => void
  }) => (
    <button
      type="button"
      onClick={() => {
        const selectedDay = new Date(2026, 6, 15)
        onSelect({ from: selectedDay, to: selectedDay }, selectedDay)
      }}
    >
      Select July 15
    </button>
  ),
}))

import BookingFormView from "../BookingFormView"

describe("BookingFormView calendar", () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    window.scrollTo = vi.fn()
    availabilityUseQuery.mockClear()
  })

  it("keeps the booking form usable after the first date click", async () => {
    const user = userEvent.setup()

    render(
      <BookingFormView
        item={{
          id: "tearoom",
          name: "Tearoom",
          type: "ROOM",
          totalQuantity: 1,
          images: [],
        }}
        session={
          {
            user: { id: "user-1", role: "USER" },
            expires: "2099-01-01T00:00:00.000Z",
          } as never
        }
        authStatus="authenticated"
        currentLocale={enUS}
        onGoBack={vi.fn()}
        onBookingSuccess={vi.fn()}
        onLoginRequest={vi.fn()}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Select July 15" }))

    await waitFor(() => {
      expect(availabilityUseQuery).toHaveBeenCalled()
      expect(screen.getByRole("button", { name: "Select July 15" })).toBeTruthy()
      expect((screen.getByLabelText("startTime") as HTMLInputElement).disabled).toBe(false)
      expect(screen.getByText("Error loading availability. Please try again.")).toBeTruthy()
    })
  })
})
