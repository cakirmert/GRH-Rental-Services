import { describe, it, expect, vi } from "vitest"

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }))

// Mock return 10 users
const users = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}` }))

const prisma = {
  user: {
    findMany: vi.fn().mockResolvedValue(users),
    deleteMany: vi.fn().mockResolvedValue({}),
  },
  booking: {
    deleteMany: vi.fn().mockResolvedValue({}),
  },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))

describe("deleteInactiveUsers Performance", () => {
  it("should execute optimized queries (no N+1)", async () => {
    const { deleteInactiveUsers } = await import("../deleteInactiveUsers")
    await deleteInactiveUsers()

    // We expect user.findMany to be called once
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)

    // Optimized behavior: 1 call each regardless of user count
    expect(prisma.booking.deleteMany).toHaveBeenCalledTimes(1)
    expect(prisma.user.deleteMany).toHaveBeenCalledTimes(1)
  })
})
