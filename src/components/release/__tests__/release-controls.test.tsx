import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ReleaseControls from "../ReleaseControls"

const { account, preference } = vi.hoisted(() => ({
  account: { role: null as string | null },
  preference: { mode: "preview", setMode: vi.fn() },
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: account.role ? { user: { id: "staff-test", role: account.role } } : null,
  }),
}))
vi.mock("@/contexts/ReleaseContext", () => ({ useRelease: () => preference }))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ locale: "en" }) }))
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ mode }: { mode: string }) => <output aria-label="Feedback dialog">{mode}</output>,
}))
beforeEach(() => {
  preference.mode = "preview"
  preference.setMode.mockClear()
})
afterEach(cleanup)

describe("compact staff calendar controls", () => {
  it.each([null, "USER", "RENTAL", "ADMIN"])("limits the controls for role %s", (role) => {
    account.role = role
    render(<ReleaseControls />)
    const eligible = role === "RENTAL" || role === "ADMIN"
    expect(Boolean(screen.queryByRole("button", { name: "Use classic calendar" }))).toBe(eligible)
    expect(Boolean(screen.queryByRole("button", { name: "Calendar feedback" }))).toBe(eligible)
    expect(Boolean(screen.queryByRole("button", { name: "Feedback overview" }))).toBe(
      role === "ADMIN",
    )
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
