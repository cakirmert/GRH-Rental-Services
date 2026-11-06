import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { deleteOldBookings } from "../cleanOldBookings"

vi.mock("@/lib/prismadb", () => {
  const db = {
    booking: {
      findMany: vi.fn().mockResolvedValue([{ id: "old-booking" }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    log: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  }
  return {
    __esModule: true,
    default: {
      ...db,
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(db)),
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
        status: { in: ["COMPLETED", "CANCELLED", "DECLINED"] },
        id: { in: ["old-booking"] },
      },
    })
    expect(prisma.log.deleteMany).toHaveBeenCalledWith({
      where: { bookingId: { in: ["old-booking"] } },
    })
  })
})
