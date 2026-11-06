import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const BookingStatus = {
  ACCEPTED: "ACCEPTED",
  BORROWED: "BORROWED",
}

const prismaMock = {
  booking: {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}

vi.mock("@/lib/prismadb", () => ({
  __esModule: true,
  default: prismaMock,
}))

// Mock @prisma/client if it's not available in the environment
vi.mock("@prisma/client", () => ({
  BookingStatus,
}))

describe("markUpcomingBookingsBorrowed optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-06T18:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("performs a single updateMany call instead of multiple updates", async () => {
    const { markUpcomingBookingsBorrowed } = await import("../autoBorrowed")

    prismaMock.booking.updateMany.mockResolvedValue({ count: 3 })

    expect(await markUpcomingBookingsBorrowed()).toEqual({ count: 3 })

    expect(prismaMock.booking.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.ACCEPTED,
        startDate: {
          lte: new Date("2026-11-06T18:15:00Z"),
        },
        endDate: { gt: new Date("2026-11-06T18:00:00Z") },
      },
      data: { status: BookingStatus.BORROWED },
    })
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled()
    expect(prismaMock.booking.update).not.toHaveBeenCalled()
  })
})
