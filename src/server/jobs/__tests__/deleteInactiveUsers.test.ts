import { describe, it, expect, vi } from "vitest"

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }))

const prisma = {
  user: {
    findMany: vi.fn().mockResolvedValue([{ id: "u1" }]),
    delete: vi.fn().mockResolvedValue({}),
  },
  booking: {
    deleteMany: vi.fn().mockResolvedValue({}),
  },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))

describe("deleteInactiveUsers", () => {
  it("removes bookings and user records", async () => {
    const { deleteInactiveUsers } = await import("../deleteInactiveUsers")
    await deleteInactiveUsers()
    expect(prisma.user.findMany).toHaveBeenCalled()
    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } })
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } })
  })
})
