import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ReleaseControls from "../ReleaseControls"
import Footer from "@/components/Footer"

const { account, preference } = vi.hoisted(() => ({
  account: { role: null as string | null, status: "authenticated" },
  preference: { mode: "preview", setMode: vi.fn() },
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: account.role ? { user: { id: "staff-test", role: account.role } } : null,
    status: account.status,
  }),
}))
vi.mock("@/contexts/ReleaseContext", () => ({ useRelease: () => preference }))
vi.mock("@/locales/i18n", () => ({
  useI18n: () => ({ locale: "en", t: (key: string) => key }),
}))
vi.mock("@/contexts/ViewContext", () => ({
  useView: () => ({ setView: vi.fn() }),
  View: {},
}))
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ mode }: { mode: string }) => <output aria-label="Feedback dialog">{mode}</output>,
}))
beforeEach(() => {
  account.role = "RENTAL"
  account.status = "authenticated"
  preference.mode = "preview"
  preference.setMode.mockClear()
})
afterEach(cleanup)

describe("compact staff calendar controls", () => {
  it.each([
    [null, "unauthenticated", false],
    ["USER", "authenticated", false],
    ["RENTAL", "authenticated", true],
    ["ADMIN", "authenticated", true],
    ["RENTAL", "loading", false],
    ["ADMIN", "loading", false],
    ["ADMIN", "unauthenticated", false],
  ] as const)("limits controls for role %s while %s", (role, status, eligible) => {
    account.role = role
    account.status = status
    render(<ReleaseControls />)
    expect(Boolean(screen.queryByRole("button", { name: "Use classic calendar" }))).toBe(eligible)
    expect(Boolean(screen.queryByRole("button", { name: "Calendar feedback" }))).toBe(eligible)
    expect(Boolean(screen.queryByRole("button", { name: "Feedback overview" }))).toBe(
      eligible && role === "ADMIN",
    )
  })

  it("never puts calendar controls in the global footer, even for an administrator", () => {
    account.role = "ADMIN"
    render(<Footer />)
    const footer = within(screen.getByRole("contentinfo"))
    expect(footer.queryByRole("region", { name: "Calendar feedback and settings" })).toBeNull()
    expect(footer.queryByRole("button", { name: "Calendar feedback" })).toBeNull()
    expect(footer.queryByRole("button", { name: "Use classic calendar" })).toBeNull()
    expect(footer.queryByRole("button", { name: "Feedback overview" })).toBeNull()
    expect(footer.getByRole("button", { name: "footer.suggestionsPrompt" })).toBeTruthy()
  })

  it("removes an open feedback dialog immediately when staff access disappears", () => {
    const view = render(<ReleaseControls />)
    fireEvent.click(screen.getByRole("button", { name: "Calendar feedback" }))
    expect(screen.getByLabelText("Feedback dialog").textContent).toBe("submit")
    account.role = "USER"
    view.rerender(<ReleaseControls />)
    expect(screen.queryByLabelText("Feedback dialog")).toBeNull()
    expect(screen.queryByRole("region", { name: "Calendar feedback and settings" })).toBeNull()
  })

  it("opens the required reason form before switching to classic", () => {
    account.role = "RENTAL"
    render(<ReleaseControls />)
    fireEvent.click(screen.getByRole("button", { name: "Use classic calendar" }))
    expect(screen.getByLabelText("Feedback dialog").textContent).toBe("classic")
    expect(preference.setMode).not.toHaveBeenCalled()
    expect(screen.queryByRole("heading")).toBeNull()
  })

  it("switches back to the new calendar immediately", () => {
    account.role = "RENTAL"
    preference.mode = "classic"
    render(<ReleaseControls />)
    fireEvent.click(screen.getByRole("button", { name: "Use new calendar" }))
    expect(preference.setMode).toHaveBeenCalledWith("preview")
    expect(screen.queryByLabelText("Feedback dialog")).toBeNull()
  })
})
