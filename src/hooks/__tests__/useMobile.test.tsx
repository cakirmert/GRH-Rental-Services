import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useIsMobile } from "../useMobile"

function resizeTo(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event("resize"))
}

let trigger: () => void
beforeEach(() => {
  let listener: ((e: { matches: boolean }) => void) | undefined
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return window.innerWidth < 768
    },
    media: query,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => {
      listener = l
    },
    removeEventListener: vi.fn(),
  }))
  trigger = () => listener && listener({ matches: window.innerWidth < 768 })
})

describe("useIsMobile", () => {
  it.each([
    [767, true],
    [768, false],
  ])("uses the mobile breakpoint at width %i", (width, expected) => {
    resizeTo(width as number)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(expected)
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)")
  })

  it("returns true when width below breakpoint", () => {
    resizeTo(500)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it("updates when window is resized", () => {
    resizeTo(800)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => {
      resizeTo(500)
      trigger()
    })
    expect(result.current).toBe(true)
  })
})
