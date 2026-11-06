import { afterEach, describe, it, expect, vi } from "vitest"
import { cleanup, renderHook, act } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { hydrateRoot } from "react-dom/client"
import { useMediaQuery } from "../useMediaQuery"

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
    const listeners = new Set<() => void>()
    const media = {
      matches: false,
      addEventListener: vi.fn((_event: string, notify: () => void) => listeners.add(notify)),
      removeEventListener: vi.fn((_event: string, notify: () => void) => listeners.delete(notify)),
    }
    window.matchMedia = vi.fn().mockReturnValue(media)
    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 100px)"))
    expect(result.current).toBe(false)

    act(() => {
      media.matches = true
      listeners.forEach((notify) => notify())
    })
    expect(result.current).toBe(true)
    unmount()
    expect(listeners.size).toBe(0)
  })

  it("switches subscriptions when the requested query changes", () => {
    window.matchMedia = mockMatchMedia(true)
    const { rerender, result, unmount } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: "(min-width: 100px)" },
    })
    const first = vi.mocked(window.matchMedia).mock.results[0].value
    window.matchMedia = mockMatchMedia(false)
    rerender({ query: "(min-width: 200px)" })
    expect(first.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function))
    expect(result.current).toBe(false)
    unmount()
  })

  it("hydrates the server fallback before reading the matching client viewport", async () => {
    window.matchMedia = mockMatchMedia(true)
    function Label() {
      return <p>{useMediaQuery("(min-width: 100px)") ? "Wide" : "Narrow"}</p>
    }
    const container = document.createElement("div")
    container.innerHTML = renderToString(<Label />)
    expect(container.textContent).toBe("Narrow")
    const errors: unknown[] = []
    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, <Label />, {
        onRecoverableError: (error) => errors.push(error),
      })
    })
    expect(container.textContent).toBe("Wide")
    expect(errors).toEqual([])
    act(() => root.unmount())
  })
})

afterEach(cleanup)
