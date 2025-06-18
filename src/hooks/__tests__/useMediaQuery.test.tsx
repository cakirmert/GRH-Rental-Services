import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useMediaQuery } from "../use-media-query"

function mockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }))
}

describe("useMediaQuery", () => {
  it("returns match state for query", () => {
    window.matchMedia = mockMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery("(min-width: 100px)"))
    expect(result.current).toBe(true)
  })

  it("updates when query match changes", () => {
    const listeners: Array<(e: { matches: boolean }) => void> = []
    // create manual matchMedia to capture listener
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      const mql = {
        matches: false,
        media: query,
        addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
        removeEventListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      }
      return mql
    })
    const { result } = renderHook(() => useMediaQuery("(min-width: 100px)"))
    expect(result.current).toBe(false)

    act(() => {
      listeners.forEach((l) => l({ matches: true }))
    })
    expect(result.current).toBe(true)
  })
})
