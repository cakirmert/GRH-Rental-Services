// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUser: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("../../../../auth", () => ({ auth: mocks.auth }))
vi.mock("@/lib/prismadb", () => ({ default: { user: { findUnique: mocks.findUser } } }))

import { getCurrentAccount, requireAdmin, requireCurrentAccount, requireStaff, IdentityAccessError } from "../server"

const stored = {
  id: "existing-account", name: "Current name", email: "current@example.test",
  role: "USER", isSuperAdmin: false,
}

describe("server identity compatibility and fresh authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({
      user: { id: stored.id, name: "Old name", email: "old@example.test", role: "ADMIN", isSuperAdmin: true },
    })
    mocks.findUser.mockResolvedValue({ ...stored })
  })

  it("uses the existing session ID but fresh database profile and privileges", async () => {
    expect(await getCurrentAccount()).toEqual({ ...stored, image: null })
    expect(mocks.auth).toHaveBeenCalledWith()
    expect(mocks.findUser).toHaveBeenCalledWith({
      where: { id: stored.id },
      select: { id: true, name: true, email: true, role: true, isSuperAdmin: true },
    })
  })

  it.each([null, { user: { id: "" } }])("does not query an account without an authenticated ID", async session => {
    mocks.auth.mockResolvedValue(session)
    expect(await getCurrentAccount()).toBeNull()
    expect(mocks.findUser).not.toHaveBeenCalled()
    await expect(requireCurrentAccount()).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 })
  })

  it("rejects a deleted account even while its session exists", async () => {
    mocks.findUser.mockResolvedValue(null)
    expect(await getCurrentAccount()).toBeNull()
    await expect(requireAdmin()).rejects.toBeInstanceOf(IdentityAccessError)
    await expect(requireStaff()).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  })

  it.each(["USER", "RENTAL", "ADMIN"])("allows an existing %s account through the account guard", async role => {
    mocks.findUser.mockResolvedValue({ ...stored, role })
    expect((await requireCurrentAccount()).role).toBe(role)
  })

  it.each(["RENTAL", "ADMIN"])("allows fresh %s staff membership", async role => {
    mocks.auth.mockResolvedValue({ user: { id: stored.id, role: "USER" } })
    mocks.findUser.mockResolvedValue({ ...stored, role })
    expect((await requireStaff()).role).toBe(role)
  })

  it("rejects stale admin/staff claims after a demotion", async () => {
    await expect(requireStaff()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
    await expect(requireAdmin()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
  })

  it("checks the database again between authorization decisions", async () => {
    mocks.findUser.mockResolvedValueOnce({ ...stored, role: "ADMIN", isSuperAdmin: true })
    expect((await requireAdmin()).isSuperAdmin).toBe(true)
    await expect(requireAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(mocks.findUser).toHaveBeenCalledTimes(2)
  })

  it("requires ADMIN rather than RENTAL or a standalone super-admin flag", async () => {
    mocks.findUser.mockResolvedValue({ ...stored, role: "RENTAL", isSuperAdmin: true })
    await expect(requireAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" })
    mocks.findUser.mockResolvedValue({ ...stored, isSuperAdmin: true })
    await expect(requireStaff()).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("propagates database failures instead of trusting the session role", async () => {
    const failure = new Error("Database unavailable")
    mocks.findUser.mockRejectedValue(failure)
    await expect(requireAdmin()).rejects.toBe(failure)
  })
})
