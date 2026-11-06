import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm, useWatch } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { berlinDateFromParts } from "@/lib/berlin-time"

const state = vi.hoisted(() => ({
  intervals: [] as Array<{
    id: string
    startDate: Date
    endDate: Date
    status: string
    quantity: number
  }>,
}))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    bookings: {
      availability: { useQuery: () => ({ data: state.intervals, isLoading: false, error: null }) },
    },
  },
}))
vi.mock("@/locales/i18n", () => ({
  useI18n: () => ({
    t: (_key: string, values: { available: number; total: number }) =>
      `${values.available} of ${values.total} available`,
  }),
}))

import Picker from "../InteractiveTimeRangePicker"

function Fixture({
  to,
  start = "09:00",
  end = "15:00",
}: {
  to?: Date
  start?: string
  end?: string
}) {
  const form = useForm({ defaultValues: { startTime: start, endTime: end } })
  const values = useWatch({ control: form.control })
  return (
    <>
      <Picker
        control={form.control}
        itemId="fixture"
        totalQuantity={3}
        dateRange={{ from: berlinDateFromParts(2027, 0, 4), to }}
      />
      <output aria-label="Selected times">
        {values.startTime} – {values.endTime}
      </output>
    </>
  )
}

beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
)
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("availability with recurring block occurrences", () => {
  it("shows two units available when separate one-unit blocks overlap different parts of the selection", () => {
    state.intervals = [9, 12].map((hour) => ({
      id: `block:${hour}`,
      startDate: berlinDateFromParts(2027, 0, 4, hour),
      endDate: berlinDateFromParts(2027, 0, 4, hour + 1),
      status: "ACCEPTED",
      quantity: 1,
    }))
    render(<Fixture />)
    expect(screen.getByText("2 of 3 available")).toBeVisible()
  })
  it("includes blocked capacity on middle days of a longer selection", () => {
    state.intervals = [
      {
        id: "middle",
        startDate: berlinDateFromParts(2027, 0, 6, 18),
        endDate: berlinDateFromParts(2027, 0, 6, 20),
        status: "ACCEPTED",
        quantity: 3,
      },
    ]
    render(<Fixture to={berlinDateFromParts(2027, 0, 7)} />)
    expect(screen.getByText("0 of 3 available")).toBeVisible()
    expect(screen.getByText("07 Jan")).toBeVisible()
  })

  it("lets the keyboard change both times in quarter-hour steps", async () => {
    state.intervals = []
    const user = userEvent.setup()
    render(<Fixture />)
    screen.getByRole("slider", { name: /Start · 04 Jan/ }).focus()
    await user.keyboard("{ArrowRight}")
    screen.getByRole("slider", { name: /End · 04 Jan/ }).focus()
    await user.keyboard("{ArrowLeft}")
    expect(screen.getByLabelText("Selected times")).toHaveTextContent("09:15 – 14:45")
  })

  it("does not move a handle into fully booked time", async () => {
    state.intervals = [
      {
        id: "full",
        startDate: berlinDateFromParts(2027, 0, 4, 8, 15),
        endDate: berlinDateFromParts(2027, 0, 4, 9),
        status: "ACCEPTED",
        quantity: 3,
      },
    ]
    const user = userEvent.setup()
    render(<Fixture />)
    screen.getByRole("slider", { name: /Start · 04 Jan/ }).focus()
    await user.keyboard("{ArrowLeft}")
    expect(screen.getByLabelText("Selected times")).toHaveTextContent("09:00 – 15:00")
  })

  it("keeps the multi-day start handle within the available dropdown times", async () => {
    state.intervals = []
    const user = userEvent.setup()
    render(<Fixture to={berlinDateFromParts(2027, 0, 5)} />)
    screen.getByRole("slider", { name: /Start · 04 Jan/ }).focus()
    await user.keyboard("{End}")
    expect(screen.getByLabelText("Selected times")).toHaveTextContent("21:45 – 15:00")
  })

  it("corrects a second-day default that falls within an overnight block", () => {
    state.intervals = [
      {
        id: "overnight",
        startDate: berlinDateFromParts(2027, 0, 4, 14),
        endDate: berlinDateFromParts(2027, 0, 5, 14),
        status: "ACCEPTED",
        quantity: 3,
      },
    ]
    render(<Fixture to={berlinDateFromParts(2027, 0, 5)} start="08:00" end="08:15" />)
    expect(screen.getByLabelText("Selected times")).toHaveTextContent("08:00 – 14:15")
    expect(
      within(screen.getByRole("region", { name: "Availability" })).getByRole("status"),
    ).toHaveTextContent("This period includes fully booked time")
  })

  it("rechecks defaults when only the end date changes", () => {
    state.intervals = [
      {
        id: "end-date",
        startDate: berlinDateFromParts(2027, 0, 5, 20),
        endDate: berlinDateFromParts(2027, 0, 6, 16),
        status: "ACCEPTED",
        quantity: 3,
      },
    ]
    const { rerender } = render(<Fixture to={berlinDateFromParts(2027, 0, 5)} />)
    expect(screen.getByLabelText("Selected times")).toHaveTextContent("09:00 – 15:00")
    rerender(<Fixture to={berlinDateFromParts(2027, 0, 6)} />)
    expect(screen.getByLabelText("Selected times")).toHaveTextContent("09:00 – 16:15")
  })

  it("allows an end at the next booking's start, but not inside it", async () => {
    state.intervals = [
      {
        id: "boundary",
        startDate: berlinDateFromParts(2027, 0, 4, 15, 15),
        endDate: berlinDateFromParts(2027, 0, 4, 16, 15),
        status: "ACCEPTED",
        quantity: 3,
      },
    ]
    const user = userEvent.setup()
    render(<Fixture />)
    screen.getByRole("slider", { name: /End · 04 Jan/ }).focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByLabelText("Selected times")).toHaveTextContent("09:00 – 15:15")
    await user.keyboard("{ArrowRight}")
    expect(screen.getByLabelText("Selected times")).toHaveTextContent("09:00 – 15:15")
  })

  it("shows no selectable handle when the whole date is booked", () => {
    state.intervals = [
      {
        id: "all-day",
        startDate: berlinDateFromParts(2027, 0, 4, 8),
        endDate: berlinDateFromParts(2027, 0, 4, 22),
        status: "ACCEPTED",
        quantity: 3,
      },
    ]
    render(<Fixture />)
    expect(screen.queryByRole("slider")).not.toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "Availability" })).getByRole("status"),
    ).toHaveTextContent("Please choose another date")
  })
})
