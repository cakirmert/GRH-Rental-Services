import { describe, it, expect, vi } from "vitest"
import { TRPCError } from "@trpc/server"

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }))

const prisma = {
  $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma)),
  user: {
    findMany: vi.fn().mockResolvedValue([{ id: "u1" }]),
    findFirst: vi.fn().mockResolvedValue({ id: "u1", email: "user@example.test" }),
    delete: vi.fn().mockResolvedValue({ id: "u1" }),
  },
  booking: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  bookingChatMessage: { findMany: vi.fn().mockResolvedValue([]) },
  notification: { deleteMany: vi.fn() },
  log: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  verificationToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  authState: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  releaseFeedback: { updateMany: vi.fn() },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))

describe("deleteInactiveUsers", () => {
  it("removes only inactive non-staff users without operational bookings in one transaction", async () => {
    const { deleteInactiveUsers } = await import("../deleteInactiveUsers")
    await deleteInactiveUsers()

    expect(prisma.user.findMany).toHaveBeenCalled()
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "USER",
          isSuperAdmin: false,
          lastLoginAt: { lt: expect.any(Date) },
          lastActiveAt: { lt: expect.any(Date) },
          responsibleItems: { none: {} },
        }),
      }),
    )

    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
      },
    })

    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: "u1" },
    })
  })

  it("preserves a user and records when any active or future booking remains", async () => {
    vi.clearAllMocks()
    prisma.booking.findFirst.mockResolvedValueOnce({ id: "active" })
    const { deleteInactiveUsers } = await import("../deleteInactiveUsers")
    await deleteInactiveUsers()
    expect(prisma.booking.deleteMany).not.toHaveBeenCalled()
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })

  it("skips a concurrent account change without retrying it, then continues with the next candidate", async () => {
    vi.clearAllMocks()
    prisma.user.findMany.mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }])
    prisma.$transaction.mockRejectedValueOnce(new TRPCError({ code: "CONFLICT" }))
    prisma.user.findFirst.mockResolvedValueOnce({ id: "u2", email: "user2@example.test" })
    const { deleteInactiveUsers } = await import("../deleteInactiveUsers")
    expect(await deleteInactiveUsers()).toEqual({ candidates: 2, deleted: 1, skipped: 1 })
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(prisma.user.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: "u2" } })
  })
})
