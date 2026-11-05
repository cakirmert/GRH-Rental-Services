import { describe, it, expect, vi } from "vitest"

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }))

const prisma = {
  $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma)),
  user: {
    findMany: vi.fn().mockResolvedValue([{ id: "u1" }]),
    findFirst: vi.fn().mockResolvedValue({ id: "u1" }),
    delete: vi.fn().mockResolvedValue({ id: "u1" }),
  },
  booking: {
    findFirst: vi.fn().mockResolvedValue(null),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))

describe("deleteInactiveUsers", () => {
  it("removes only inactive non-staff users without operational bookings in one transaction", async () => {
    const { deleteInactiveUsers } = await import("../deleteInactiveUsers")
    await deleteInactiveUsers()

    expect(prisma.user.findMany).toHaveBeenCalled()

    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        status: { in: ["COMPLETED", "CANCELLED", "DECLINED"] },
        endDate: { lt: expect.any(Date) },
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
})
