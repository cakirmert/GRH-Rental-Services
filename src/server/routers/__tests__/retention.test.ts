import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Context } from "@/server/context"
import { router } from "@/lib/trpcServer"
import { retentionProcedures } from "../retentionProcedures"

const deleteData = vi.hoisted(() => vi.fn())
vi.mock("@/server/accountDeletion", () => ({ deleteAccountData: deleteData }))
const db = {
  $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(db)),
  user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}
const inactive = new Date(Date.now() - 400 * 86400000)
const target = () => ({
  id: "target",
  name: "Fixture",
  email: "fixture@example.test",
  role: "RENTAL",
  isSuperAdmin: false,
  lastLoginAt: inactive,
  lastActiveAt: inactive,
  _count: { bookings: 0, assignedBookings: 0, responsibleItems: 0 },
})
const actor = () => ({ id: "admin", role: "ADMIN", isSuperAdmin: false })
const caller = () =>
  router(retentionProcedures).createCaller({
    prisma: db as unknown as Context["prisma"],
    session: {
      user: { id: "admin", role: "ADMIN", email: "admin@example.test" },
      expires: "2099-01-01",
    },
    req: new Request("http://localhost/api/trpc"),
  })
const input = () => ({
  userId: "target",
  expectedLastLoginAt: inactive,
  expectedLastActiveAt: inactive,
})

describe("manual inactive-account review authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "admin" ? actor() : target(),
    )
    db.user.findMany.mockResolvedValue([target()])
    db.user.count.mockResolvedValue(2)
  })

  it("reviews without deleting and requires both inactivity timestamps", async () => {
    expect((await caller().inactiveAccounts({})).accounts[0]).toMatchObject({
      canDelete: true,
      lastActiveAt: inactive,
      blockers: [],
    })
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: { in: ["RENTAL", "ADMIN"] },
          lastLoginAt: { lt: expect.any(Date) },
          lastActiveAt: { lt: expect.any(Date) },
        },
        take: 51,
      }),
    )
    expect(deleteData).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it.each(["USER", "RENTAL"])(
    "rejects a stale admin session after demotion to %s",
    async (role) => {
      db.user.findUnique.mockResolvedValue({ ...actor(), role })
      await expect(caller().inactiveAccounts({})).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(caller().deleteInactiveAccount(input())).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      expect(db.user.findMany).not.toHaveBeenCalled()
      expect(deleteData).not.toHaveBeenCalled()
    },
  )

  it.each(["lastLoginAt", "lastActiveAt"])(
    "rejects activity after confirmation was opened (%s)",
    async (field) => {
      db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === "admin" ? actor() : { ...target(), [field]: new Date() },
      )
      await expect(caller().deleteInactiveAccount(input())).rejects.toMatchObject({
        code: "CONFLICT",
      })
      expect(deleteData).not.toHaveBeenCalled()
    },
  )

  it.each(["bookings", "assignedBookings", "responsibleItems"])(
    "rejects deletion if %s appeared since review",
    async (field) => {
      db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === "admin"
          ? actor()
          : { ...target(), _count: { ...target()._count, [field]: 1 } },
      )
      await expect(caller().deleteInactiveAccount(input())).rejects.toMatchObject({
        code: "BAD_REQUEST",
      })
      expect(deleteData).not.toHaveBeenCalled()
    },
  )

  it("does not let an ordinary admin delete an admin account", async () => {
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "admin" ? actor() : { ...target(), role: "ADMIN" },
    )
    await expect(caller().deleteInactiveAccount(input())).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    expect(deleteData).not.toHaveBeenCalled()
  })

  it("performs confirmed eligible deletion in serializable isolation", async () => {
    expect(await caller().deleteInactiveAccount(input())).toEqual({ success: true })
    expect(deleteData).toHaveBeenCalledWith(db, target())
    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    )
  })
})
