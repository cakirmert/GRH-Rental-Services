import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import DashboardHelpSheet from "../DashboardHelpSheet"
import OnboardingOverlay from "../OnboardingOverlay"
import NotAuthorized from "../NotAuthorized"
import { I18nProvider } from "@/locales/i18n"

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("dashboard tour preferences", () => {
  const page = (role: "rental" | "admin") => (
    <I18nProvider>
      <DashboardHelpSheet role={role} />
    </I18nProvider>
  )

  it("reads the current role's preference and updates when another tab changes it", () => {
    localStorage.setItem("onboarding_rental_seen", "true")
    const view = render(page("rental"))
    expect(screen.queryByRole("button", { name: "Quick Tour" })).toBeNull()
    view.rerender(page("admin"))
    expect(screen.getByRole("button", { name: "Quick Tour" })).toBeTruthy()
    act(() => {
      localStorage.setItem("onboarding_admin_seen", "true")
      window.dispatchEvent(
        new StorageEvent("storage", { key: "onboarding_admin_seen", newValue: "true" }),
      )
    })
    expect(screen.queryByRole("button", { name: "Quick Tour" })).toBeNull()
  })

  it("marks a started tour as seen and restarts from the help control", async () => {
    render(page("rental"))
    await userEvent.click(screen.getByRole("button", { name: "Quick Tour" }))
    expect(localStorage.getItem("onboarding_rental_seen")).toBe("true")
    expect(screen.queryByRole("button", { name: "Quick Tour" })).toBeNull()
    await userEvent.keyboard("{ArrowRight}")
    expect(screen.getByText("2 of 5")).toBeTruthy()
    await userEvent.keyboard("{Escape}")
    await userEvent.click(screen.getByRole("button", { name: "Help" }))
    await userEvent.click(screen.getByRole("button", { name: "Restart Interactive Tour" }))
    expect(screen.getByText("1 of 5")).toBeTruthy()
  })

  it("still opens help and remembers the tour in this tab when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable")
    })
    render(page("admin"))
    await userEvent.click(screen.getByRole("button", { name: "Quick Tour" }))
    expect(screen.getByText("1 of 7")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Quick Tour" })).toBeNull()
    await userEvent.keyboard("{Escape}")
    await userEvent.click(screen.getByRole("button", { name: "Help" }))
    expect(screen.getByRole("button", { name: "Restart Interactive Tour" })).toBeTruthy()
  })

  it("explains manual inactive-staff review and highlights its admin entry", async () => {
    render(
      <I18nProvider>
        <button id="admin-quick-inactive">Inactive staff</button>
        <DashboardHelpSheet role="admin" />
      </I18nProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Quick Tour" }))
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}")
    expect(screen.getByText("4 of 7")).toBeTruthy()
    expect(screen.getByText(/Staff accounts are never deleted automatically/)).toBeTruthy()
    const inactive = screen.getByRole("button", { name: "Inactive staff" })
    expect(inactive.classList.contains("ring-blue-500")).toBe(true)
    await userEvent.keyboard("{Escape}")
    expect(inactive.classList.contains("ring-blue-500")).toBe(false)
  })
})

describe("tour lifecycle and target positioning", () => {
  const steps = [
    { selector: "#tour-first", index: 1 },
    { selector: "#tour-second", index: 2 },
  ]
  function Fixture({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    return (
      <>
        <button id="tour-first" className="relative">
          First target
        </button>
        <button id="tour-second">Second target</button>
        <OnboardingOverlay
          visible={visible}
          steps={steps}
          helpSteps={["First instruction", "Second instruction"]}
          onClose={onClose}
        />
      </>
    )
  }

  it("cleans up highlights on finish, preserves existing classes, and reopens at the first step", async () => {
    const close = vi.fn()
    const view = render(<Fixture visible onClose={close} />)
    const first = screen.getByRole("button", { name: "First target" })
    const second = screen.getByRole("button", { name: "Second target" })
    expect(first.classList.contains("ring-blue-500")).toBe(true)
    await userEvent.keyboard("{ArrowRight}")
    expect(screen.getByText("Second instruction")).toBeTruthy()
    expect(first.classList.contains("ring-blue-500")).toBe(false)
    expect(first.classList.contains("relative")).toBe(true)
    expect(second.classList.contains("ring-blue-500")).toBe(true)
    await userEvent.click(screen.getByRole("button", { name: "Finish" }))
    expect(close).toHaveBeenCalledOnce()
    expect(screen.queryByText("Interactive Tour")).toBeNull()
    expect(second.classList.contains("ring-blue-500")).toBe(false)
    view.rerender(<Fixture visible={false} onClose={close} />)
    view.rerender(<Fixture visible onClose={close} />)
    expect(screen.getByText("First instruction")).toBeTruthy()
    expect(first.classList.contains("ring-blue-500")).toBe(true)
    await userEvent.keyboard("{Escape}")
    expect(close).toHaveBeenCalledTimes(2)
    expect(first.className).toBe("relative")
  })

  it("keeps fixed target markers aligned when a nested container scrolls", () => {
    let top = 100
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      return new DOMRect(30, this.id === "tour-first" ? top : 200, 100, 40)
    })
    render(<Fixture visible onClose={vi.fn()} />)
    expect(screen.getByText("1").style.top).toBe("84px")
    act(() => {
      top = 60
      screen.getByRole("button", { name: "First target" }).dispatchEvent(new Event("scroll"))
    })
    expect(screen.getByText("1").style.top).toBe("44px")
  })

  it("does not access portal DOM during server rendering", () => {
    expect(renderToString(<OnboardingOverlay visible steps={steps} />)).toBe("")
  })
})

it("renders the access message deterministically before its entrance animation", () => {
  const page = (
    <I18nProvider>
      <NotAuthorized onGoBack={vi.fn()} />
    </I18nProvider>
  )
  const first = renderToString(page)
  expect(first).toContain("Admin Access Required")
  expect(renderToString(page)).toBe(first)
})
