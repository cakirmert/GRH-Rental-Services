import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { notificationsRouter } from "../notificationRouter"
import type { Context } from "@/server/context"
import type { Request } from "express"

function createCaller() {
  const prisma = {
    notification: {
      delete: vi.fn(),
    },
  }
  const ctx: Context = {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id: "admin1", role: "ADMIN", email: "admin@example.com" },
      expires: "2024-12-31T23:59:59.000Z",
    },
    req: new Request("http://localhost:3000/test"),
  }
  const caller = notificationsRouter.createCaller(ctx)
  return { caller, prisma }
}
describe("notification delete", () => {
  it("deletes notification by id", async () => {
    const { caller, prisma } = createCaller()
    await caller.delete({ id: "n1" })
    expect(prisma.notification.delete).toHaveBeenCalledWith({ where: { id: "n1" } })
  })
})
