import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReleaseProvider, useRelease } from "../ReleaseContext"
import { RELEASE_ID } from "@/constants/release"

function Choice() {
  const { mode, setMode } = useRelease()
  return <><output>{mode}</output><button onClick={() => setMode("preview")}>Preview</button><button onClick={() => setMode("classic")}>Classic</button></>
}

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

describe("release preference", () => {
  it("starts in classic and persists an explicit preview selection across remounts", () => {
    localStorage.clear()
    const view = render(<ReleaseProvider><Choice /></ReleaseProvider>)
    expect(screen.getByRole("status").textContent).toBe("classic")
    fireEvent.click(screen.getByText("Preview"))
    expect(screen.getByRole("status").textContent).toBe("preview")
    view.unmount()
    render(<ReleaseProvider><Choice /></ReleaseProvider>)
    expect(screen.getByRole("status").textContent).toBe("preview")
    fireEvent.click(screen.getByText("Classic"))
    expect(screen.getByRole("status").textContent).toBe("classic")
  })

  it("responds to another tab and ignores invalid stored values", () => {
    render(<ReleaseProvider><Choice /></ReleaseProvider>)
    act(() => {
      localStorage.setItem(`grh-interface:${RELEASE_ID}`, "preview")
      window.dispatchEvent(new StorageEvent("storage", { key: `grh-interface:${RELEASE_ID}` }))
    })
    expect(screen.getByRole("status").textContent).toBe("preview")
    act(() => {
      localStorage.setItem(`grh-interface:${RELEASE_ID}`, "unexpected")
      window.dispatchEvent(new StorageEvent("storage", { key: `grh-interface:${RELEASE_ID}` }))
    })
    expect(screen.getByRole("status").textContent).toBe("classic")
  })

  it("still switches when the browser refuses storage writes", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked") })
    render(<ReleaseProvider><Choice /></ReleaseProvider>)
    fireEvent.click(screen.getByText("Preview"))
    expect(screen.getByRole("status").textContent).toBe("preview")
    write.mockRestore()
    fireEvent.click(screen.getByText("Classic"))
    expect(screen.getByRole("status").textContent).toBe("classic")
  })
})
