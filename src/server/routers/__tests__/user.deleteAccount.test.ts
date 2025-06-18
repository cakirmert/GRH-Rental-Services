import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { userRouter } from "../user"
import type { Context } from "@/server/context"
import type { Request } from "express"
import { BookingStatus } from "@prisma/client"

function createCaller(status?: BookingStatus) {
  const prisma = {
    booking: {
      findFirst: vi.fn().mockResolvedValue(status ? { id: "b1", status } : null),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    user: { delete: vi.fn().mockResolvedValue({}) },
  }
  const ctx: Context = {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id: "u1", role: "USER", email: "user@example.com" },
      expires: "2024-12-31T23:59:59.000Z",
    },
    req: new Request("http://localhost:3000/test"),
  }
  const caller = userRouter.createCaller(ctx)
  return { caller, prisma }
}

describe("user deleteAccount", () => {
  it("deletes bookings then user", async () => {
    const { caller, prisma } = createCaller()
    await caller.deleteAccount()
    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } })
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } })
  })

  it.each([BookingStatus.ACCEPTED, BookingStatus.BORROWED])(
    "rejects when user has %s booking",
    async (status) => {
      const { caller, prisma } = createCaller(status as BookingStatus)
      await expect(caller.deleteAccount()).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Cannot delete account with active bookings.",
      })
      expect(prisma.booking.deleteMany).not.toHaveBeenCalled()
      expect(prisma.user.delete).not.toHaveBeenCalled()
    },
  )
})
