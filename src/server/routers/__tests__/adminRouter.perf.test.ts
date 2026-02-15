import { describe, it, expect, vi, beforeEach } from "vitest"
import { adminRouter } from "../adminRouter"
import type { Context } from "@/server/context"

// Mock Prisma
const prisma = {
  item: {
    count: vi.fn(),
  },
  user: {
    count: vi.fn(),
  },
  booking: {
    count: vi.fn(),
  },
}

// Mock context
const ctx = {
  prisma: prisma as unknown as Context["prisma"],
  session: {
    user: {
      role: "ADMIN",
      id: "admin-id",
    },
  },
} as unknown as Context

// Helper to simulate delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("adminRouter.dashboardStats performance", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Setup mocks with delay
    prisma.item.count.mockImplementation(async () => {
      await delay(50)
      return 10
    })
    prisma.user.count.mockImplementation(async () => {
      await delay(50)
      return 5
    })
    prisma.booking.count.mockImplementation(async () => {
      await delay(50)
      return 3
    })
  })

  it("measures execution time", async () => {
    const caller = adminRouter.createCaller(ctx)
    const start = Date.now()
    const stats = await caller.dashboardStats()
    const end = Date.now()
    const duration = end - start

    console.log(`Execution time: ${duration}ms`)

    // Expect execution time to be significantly less than sequential (200ms)
    // Parallel execution should be around 50ms + overhead
    expect(duration).toBeLessThan(100)

    expect(stats).toEqual({
      totalItems: 10,
      teamMemberCount: 5,
      pendingBookings: 3,
      upcomingBookings: 3,
    })
  })
})
