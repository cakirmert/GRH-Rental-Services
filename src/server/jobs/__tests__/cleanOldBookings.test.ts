import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { deleteOldBookings } from "../cleanOldBookings"

vi.mock("@/lib/prismadb", () => {
  return {
    __esModule: true,
    default: {
      booking: {
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
    },
  }
})

import prisma from "@/lib/prismadb"

describe("deleteOldBookings", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("deletes bookings older than 180 days", async () => {
    const mockNow = new Date("2024-01-01T12:00:00.000Z")
    vi.setSystemTime(mockNow)

    await deleteOldBookings()

    const expectedThreshold = new Date(mockNow.getTime() - 180 * 24 * 60 * 60 * 1000)

    expect(prisma.booking.deleteMany).toHaveBeenCalledTimes(1)
    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({
      where: {
        endDate: { lt: expectedThreshold },
      },
    })
  })
})
