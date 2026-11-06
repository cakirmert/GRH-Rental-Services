import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode
    value: string
    onValueChange: (value: string) => void
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}))

import TimeSelect from "../TimeSelect"

describe("time option ordering is independent of device timezone and today's DST", () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("compares clock minutes without normalizing a nonexistent New York hour", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2030-03-10T12:00:00Z")) // New York spring-forward day.
    render(
      <TimeSelect
        label="End"
        value=""
        onChange={vi.fn()}
        startHour={1}
        endHour={4}
        isEndTimeSelector
        otherSelectedTime="02:30"
      />,
    )
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "02:45",
      "03:00",
      "03:15",
      "03:30",
      "03:45",
      "04:00",
    ])
  })

  it("keeps an earlier end-day boundary when the booking spans different days", () => {
    render(
      <TimeSelect
        label="End"
        value=""
        onChange={vi.fn()}
        startHour={20}
        endHour={22}
        isEndTimeSelector
        otherSelectedTime="23:00"
        shouldFilterTimes={false}
      />,
    )
    expect(screen.getByRole("option", { name: "22:00" })).toBeTruthy()
  })
})
