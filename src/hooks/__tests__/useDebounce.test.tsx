import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useDebounce } from "../useDebounce"

vi.useFakeTimers()

describe("useDebounce", () => {
  it("debounces value updates", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: "a" },
    })

    expect(result.current).toBe("a")

    rerender({ value: "b" })
    // before timer ticks, value should still be previous
    expect(result.current).toBe("a")

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe("b")
  })
})
