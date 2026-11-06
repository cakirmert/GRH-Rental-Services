import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { userRouter } from "../user"
import type { Context } from "@/server/context"
import type { Request } from "express"
import { BookingStatus } from "@prisma/client"
vi.mock("@/lib/auth/passkey-store", () => ({ revokePasskey: vi.fn() }))

function createCaller(status?: BookingStatus) {
  const prisma = {
    booking: {
      findFirst: vi.fn().mockResolvedValue(status ? { id: "b1", status } : null),
      deleteMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      delete: vi.fn().mockResolvedValue({}),
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: "u1",
          email: "user@example.com",
          role: "USER",
          isSuperAdmin: false,
        }),
      count: vi.fn().mockResolvedValue(2),
      update: vi.fn(),
    },
    item: { findFirst: vi.fn().mockResolvedValue(null) },
    bookingChatMessage: { findMany: vi.fn().mockResolvedValue([]) },
    notification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    log: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    verificationToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    authState: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    releaseFeedback: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  }
  prisma.$transaction.mockImplementation((operation) => operation(prisma))
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

  it("requires item handover before deletion, even for legacy USER responsibility", async () => {
    const { caller, prisma } = createCaller()
    prisma.item.findFirst.mockResolvedValue({ id: "item" } as never)
    await expect(caller.deleteAccount()).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.user.delete).not.toHaveBeenCalled()
    expect(prisma.log.deleteMany).not.toHaveBeenCalled()
  })

  it("requires pending assignment handover before deletion", async () => {
    const { caller, prisma } = createCaller()
    prisma.booking.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "pending" } as never)
    await expect(caller.deleteAccount()).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })

  it("requires handover before a staff member steps down", async () => {
    const { caller, prisma } = createCaller()
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      role: "RENTAL",
      isSuperAdmin: false,
    })
    prisma.item.findFirst.mockResolvedValue({ id: "item" } as never)
    await expect(caller.selfDemote()).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})
