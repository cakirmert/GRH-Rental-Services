import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import ReleaseControls from "../ReleaseControls"

const account = vi.hoisted(() => ({ role: null as string | null }))
vi.mock("next-auth/react", () => ({ useSession: () => ({
  data: account.role ? { user: { id: "staff-test", role: account.role } } : null,
}) }))
vi.mock("@/contexts/ReleaseContext", () => ({ useRelease: () => ({ mode: "classic", setMode: vi.fn() }) }))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ locale: "en" }) }))
vi.mock("next/dynamic", () => ({ default: () => () => null }))
afterEach(cleanup)

describe("preview audience", () => {
  it.each([null, "USER", "RENTAL", "ADMIN"])("limits the controls for role %s", role => {
    account.role = role
    render(<ReleaseControls />)
    const eligible = role === "RENTAL" || role === "ADMIN"
    expect(Boolean(screen.queryByRole("button", { name: "Release preview" }))).toBe(eligible)
    expect(Boolean(screen.queryByRole("button", { name: "Share feedback" }))).toBe(eligible)
    expect(Boolean(screen.queryByRole("button", { name: "Feedback overview" }))).toBe(role === "ADMIN")
  })
})
