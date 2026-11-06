import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { afterEach, describe, expect, it, vi } from "vitest"
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

function Fixture({ to }: { to?: Date }) {
  const form = useForm({ defaultValues: { startTime: "09:00", endTime: "15:00" } })
  return (
    <Picker
      control={form.control}
      itemId="fixture"
      totalQuantity={3}
      dateRange={{ from: berlinDateFromParts(2027, 0, 4), to }}
    />
  )
}

afterEach(cleanup)

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
})
