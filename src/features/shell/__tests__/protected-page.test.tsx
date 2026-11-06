import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { CurrentAccount } from "@/features/identity/types"

const mocks = vi.hoisted(() => ({ getCurrentAccount: vi.fn() }))
vi.mock("@/features/identity/server", () => ({ getCurrentAccount: mocks.getCurrentAccount }))
vi.mock("../AccessBoundary", () => ({
  default: ({ forbidden = false }: { forbidden?: boolean }) => (
    <p>{forbidden ? "Access unavailable" : "Sign in to continue"}</p>
  ),
}))

import ProtectedPage from "../ProtectedPage"

const account: CurrentAccount = {
  id: "synthetic-account",
  name: "Synthetic resident",
  email: "synthetic@example.test",
  image: null,
  role: "USER",
  isSuperAdmin: false,
}
const privateContent = <p>Private page content</p>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAccount.mockResolvedValue(account)
})

describe("server page access boundaries", () => {
  it.each(["account", "staff", "admin"] as const)(
    "offers sign-in without rendering a guest's requested %s page",
    async (role) => {
      mocks.getCurrentAccount.mockResolvedValue(null)
      const html = renderToStaticMarkup(await ProtectedPage({ role, children: privateContent }))
      expect(html).toContain("Sign in to continue")
      expect(html).not.toContain("Private page content")
    },
  )

  it.each(["USER", "RENTAL", "ADMIN"] as const)(
    "allows a current %s account to open its account page",
    async (role) => {
      mocks.getCurrentAccount.mockResolvedValue({ ...account, role })
      expect(await ProtectedPage({ children: privateContent })).toBe(privateContent)
    },
  )

  it.each(["RENTAL", "ADMIN"] as const)("allows current %s staff access", async (role) => {
    mocks.getCurrentAccount.mockResolvedValue({ ...account, role })
    expect(await ProtectedPage({ role: "staff", children: privateContent })).toBe(privateContent)
  })

  it.each([
    ["USER", "staff"],
    ["USER", "admin"],
    ["RENTAL", "admin"],
  ] as const)("does not render a %s account's requested %s page", async (role, required) => {
    mocks.getCurrentAccount.mockResolvedValue({ ...account, role })
    const html = renderToStaticMarkup(
      await ProtectedPage({ role: required, children: privateContent }),
    )
    expect(html).toContain("Access unavailable")
    expect(html).not.toContain("Private page content")
  })

  it("uses fresh authorization on every render after demotion or account deletion", async () => {
    mocks.getCurrentAccount
      .mockResolvedValueOnce({ ...account, role: "ADMIN", isSuperAdmin: true })
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(null)
    expect(await ProtectedPage({ role: "admin", children: privateContent })).toBe(privateContent)
    expect(
      renderToStaticMarkup(await ProtectedPage({ role: "admin", children: privateContent })),
    ).toContain("Access unavailable")
    expect(
      renderToStaticMarkup(await ProtectedPage({ role: "admin", children: privateContent })),
    ).toContain("Sign in to continue")
    expect(mocks.getCurrentAccount).toHaveBeenCalledTimes(3)
  })

  it("does not grant staff access from a standalone superadmin flag", async () => {
    mocks.getCurrentAccount.mockResolvedValue({ ...account, isSuperAdmin: true })
    const html = renderToStaticMarkup(
      await ProtectedPage({ role: "staff", children: privateContent }),
    )
    expect(html).toContain("Access unavailable")
    expect(html).not.toContain("Private page content")
  })

  it("lets the page error boundary handle verification failures without rendering private content", async () => {
    const error = new Error("Synthetic authorization lookup failure")
    mocks.getCurrentAccount.mockRejectedValue(error)
    await expect(ProtectedPage({ role: "admin", children: privateContent })).rejects.toBe(error)
  })
})
