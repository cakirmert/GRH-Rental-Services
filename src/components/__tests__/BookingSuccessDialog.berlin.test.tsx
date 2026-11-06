import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BookingSuccessDialog } from "../BookingSuccessDialog"

vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)

describe("booking confirmation Berlin date", () => {
  it.each([
    ["2030-07-14T22:00:00.000Z", "July 15th, 2030"],
    ["2030-01-14T23:00:00.000Z", "January 15th, 2030"],
  ])("shows the Berlin calendar date for %s", (instant, label) => {
    render(
      <BookingSuccessDialog
        open
        onOpenChange={vi.fn()}
        onViewBookings={vi.fn()}
        bookingDetails={{
          id: "booking",
          itemName: "Projector",
          date: new Date(instant),
          startTime: "14:00",
          endTime: "15:00",
        }}
      />,
    )
    expect(screen.getByText(label, { exact: false })).toBeTruthy()
  })
})
